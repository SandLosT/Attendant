import io
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import faiss
import numpy as np
import torch
import torchvision.models as models
import torchvision.transforms as transforms
import uvicorn
from fastapi import Body, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

app = FastAPI()

# ----------- Configuração do modelo -----------
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = models.resnet50(pretrained=True)
model.fc = torch.nn.Identity()  # remove a última camada FC
model = model.to(device)
model.eval()

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

# ----------- FAISS index -----------
dimension = 2048

DATA_DIR = Path(os.getenv("EMBED_INDEX_DIR", "./data/index")).resolve()
INDEX_PATH = DATA_DIR / "faiss.index"
METADATA_PATH = DATA_DIR / "metadata.json"

index = faiss.IndexFlatIP(dimension)  # cosine similarity após normalização
metadata_store: List[Dict[str, Any]] = []  # metadados das imagens_referencia


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def save_state() -> None:
    ensure_data_dir()
    faiss.write_index(index, str(INDEX_PATH))
    with METADATA_PATH.open("w", encoding="utf-8") as f:
        json.dump(metadata_store, f, ensure_ascii=False, indent=2)


def load_state() -> None:
    global index, metadata_store
    ensure_data_dir()
    if INDEX_PATH.exists():
        index = faiss.read_index(str(INDEX_PATH))
    if METADATA_PATH.exists():
        with METADATA_PATH.open("r", encoding="utf-8") as f:
            metadata_store = json.load(f)


load_state()


def construir_metadado(
    metadata_texto: str,
    budget_hint: Optional[float],
    reference_id: Optional[str] = None,
    status_faz: Optional[str] = None,
) -> Dict[str, Any]:
    entry: Dict[str, Any] = {
        "metadata": metadata_texto or None,
        "raw_metadata": metadata_texto or None,
        "budget": None,
        "status_faz": status_faz or None,
        "reference_id": reference_id,
    }

    parsed_metadata: Optional[Any] = None
    if metadata_texto:
        try:
            parsed_metadata = json.loads(metadata_texto)
        except json.JSONDecodeError:
            parsed_metadata = None

    budget_value: Optional[float] = budget_hint

    if isinstance(parsed_metadata, dict):
        entry["metadata"] = parsed_metadata
        if budget_value is None:
            potential_budget = parsed_metadata.get("budget")
            if potential_budget is not None:
                try:
                    budget_value = float(potential_budget)
                except (TypeError, ValueError):
                    budget_value = None
        if entry.get("status_faz") is None:
            entry["status_faz"] = parsed_metadata.get("status_faz")
    elif parsed_metadata is not None:
        entry["metadata"] = parsed_metadata

    if budget_value is not None:
        try:
            entry["budget"] = float(budget_value)
        except (TypeError, ValueError):
            entry["budget"] = None

    return entry


def montar_resultados(sim_scores: np.ndarray, indices: np.ndarray) -> List[Dict[str, Any]]:
    resultados: List[Dict[str, Any]] = []
    for score, idx in zip(sim_scores, indices):
        if idx < len(metadata_store):
            metadado = metadata_store[idx]
            budget = metadado.get("budget")
            resultados.append(
                {
                    "metadata": metadado.get("metadata"),
                    "budget": float(budget) if budget is not None else None,
                    "similarity": float(score),
                    "status_faz": metadado.get("status_faz"),
                    "reference_id": metadado.get("reference_id", idx),
                }
            )
    return resultados


def calcular_orcamento(resultados: List[Dict[str, Any]]) -> Optional[float]:
    """Sugere orçamento ponderando por similaridade."""

    soma_pesos = 0.0
    soma_valores = 0.0

    for resultado in resultados:
        budget = resultado.get("budget")
        similarity = resultado.get("similarity")
        if budget is None or similarity is None:
            continue

        peso = similarity
        soma_pesos += peso
        soma_valores += budget * peso

    if soma_pesos == 0.0:
        return None

    return soma_valores / soma_pesos


def get_embedding(image_bytes: bytes) -> np.ndarray:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    tensor = transform(image).unsqueeze(0).to(device)
    with torch.no_grad():
        emb = model(tensor).cpu().numpy()
    # normalização L2
    emb = emb / np.linalg.norm(emb)
    return emb.astype("float32")


# ----------- Endpoints -----------


@app.post("/embed")
async def embed_image(file: UploadFile = File(...)):
    img_bytes = await file.read()
    emb = get_embedding(img_bytes)
    return JSONResponse({"embedding": emb[0].tolist()})


@app.post("/index")
async def index_image(
    file: UploadFile = File(...),
    metadata: str = "",
    budget: str = "",
    reference_id: str = "",
    status_faz: str = "",
):
    img_bytes = await file.read()
    emb = get_embedding(img_bytes)

    faiss.normalize_L2(emb)
    index.add(emb)

    budget_value: Optional[float] = None
    if budget:
        try:
            budget_value = float(budget)
        except ValueError:
            budget_value = None

    metadado = construir_metadado(metadata, budget_value, reference_id or None, status_faz or None)
    metadata_store.append(metadado)
    save_state()
    return {"message": "Indexed successfully", "metadata": metadado}


@app.post("/search")
async def search_image(file: UploadFile = File(...), top_k: int = 5):
    img_bytes = await file.read()
    emb = get_embedding(img_bytes)
    faiss.normalize_L2(emb)

    top_k = max(1, min(top_k, index.ntotal)) if index.ntotal else 0
    if top_k == 0:
        return {"results": []}

    D, I = index.search(emb, top_k)
    results = montar_resultados(D[0], I[0])
    return {"results": results}


@app.post("/estimate")
async def estimate_budget(payload: Dict[str, Any] = Body(...)):
    embedding = payload.get("embedding")
    if embedding is None:
        raise HTTPException(status_code=400, detail="Campo 'embedding' é obrigatório")

    if index.ntotal == 0:
        return {
            "orcamento": None,
            "detalhes": [],
            "best_match_id": None,
            "best_match_score": None,
            "best_match_valor_ref": None,
            "best_match_status_faz": None,
            "suggested_value": None,
            "suggested_status_faz": None,
            "threshold_passed": False,
        }

    try:
        embedding_array = np.array([embedding], dtype="float32")
    except ValueError as err:
        raise HTTPException(status_code=400, detail=f"Embedding inválido: {err}") from err

    if embedding_array.ndim != 2 or embedding_array.shape[1] != dimension:
        raise HTTPException(status_code=400, detail="Dimensão de embedding incompatível")

    normas = np.linalg.norm(embedding_array, axis=1, keepdims=True)
    if np.any(normas == 0):
        raise HTTPException(status_code=400, detail="Embedding não pode ser o vetor zero")

    embedding_array = embedding_array / normas
    faiss.normalize_L2(embedding_array)

    top_k = payload.get("top_k", 5)
    try:
        top_k = int(top_k)
    except (TypeError, ValueError):
        top_k = 5

    top_k = max(1, min(top_k, index.ntotal))

    D, I = index.search(embedding_array, top_k)
    resultados = montar_resultados(D[0], I[0])
    orcamento = calcular_orcamento(resultados)

    threshold = float(os.getenv("ORCAMENTO_SIMILARIDADE_THRESHOLD", "0.9"))
    best_match = resultados[0] if resultados else None
    best_score = best_match.get("similarity") if best_match else None

    response = {
        "orcamento": orcamento,
        "detalhes": resultados,
        "best_match_id": best_match.get("reference_id") if best_match else None,
        "best_match_score": best_score,
        "best_match_valor_ref": best_match.get("budget") if best_match else None,
        "best_match_status_faz": best_match.get("status_faz") if best_match else None,
        "suggested_value": orcamento,
        "suggested_status_faz": best_match.get("status_faz") if best_match else None,
        "threshold_passed": bool(best_score is not None and best_score >= threshold),
    }

    return response


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
