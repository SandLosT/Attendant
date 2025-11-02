from fastapi import Body, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
import uvicorn
import torch
import torchvision.models as models
import torchvision.transforms as transforms
from PIL import Image
import numpy as np
import faiss
import io
import json
from typing import Any, Dict, List, Optional

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
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225])
])

# ----------- FAISS index -----------
dimension = 2048
index = faiss.IndexFlatL2(dimension)  # L2 distance
embeddings_store: List[np.ndarray] = []  # lista para mapear ids
metadata_store: List[Dict[str, Any]] = []    # metadados das imagens


def construir_metadado(metadata_texto: str, budget_hint: Optional[float]) -> Dict[str, Any]:
    entry: Dict[str, Any] = {
        "metadata": metadata_texto or None,
        "raw_metadata": metadata_texto or None,
        "budget": None,
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
    elif parsed_metadata is not None:
        entry["metadata"] = parsed_metadata

    if budget_value is not None:
        try:
            entry["budget"] = float(budget_value)
        except (TypeError, ValueError):
            entry["budget"] = None

    return entry


def montar_resultados(distancias: np.ndarray, indices: np.ndarray) -> List[Dict[str, Any]]:
    resultados: List[Dict[str, Any]] = []
    for dist, idx in zip(distancias, indices):
        if idx < len(metadata_store):
            metadado = metadata_store[idx]
            budget = metadado.get("budget")
            resultados.append({
                "metadata": metadado.get("metadata"),
                "budget": float(budget) if budget is not None else None,
                "distance": float(dist),
            })
    return resultados


def calcular_orcamento(resultados: List[Dict[str, Any]]) -> Optional[float]:
    soma_pesos = 0.0
    soma_valores = 0.0

    for resultado in resultados:
        budget = resultado.get("budget")
        distance = resultado.get("distance")
        if budget is None or distance is None:
            continue

        peso = 1.0 / (distance + 1e-6)
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
async def index_image(file: UploadFile = File(...), metadata: str = "", budget: str = ""):
    img_bytes = await file.read()
    emb = get_embedding(img_bytes)
    index.add(emb)
    embeddings_store.append(emb)

    budget_value: Optional[float] = None
    if budget:
        try:
            budget_value = float(budget)
        except ValueError:
            budget_value = None

    metadado = construir_metadado(metadata, budget_value)
    metadata_store.append(metadado)
    return {"message": "Indexed successfully", "metadata": metadado}


@app.post("/search")
async def search_image(file: UploadFile = File(...), top_k: int = 5):
    img_bytes = await file.read()
    emb = get_embedding(img_bytes)

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
        return {"orcamento": None, "detalhes": []}

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

    top_k = payload.get("top_k", 5)
    try:
        top_k = int(top_k)
    except (TypeError, ValueError):
        top_k = 5

    top_k = max(1, min(top_k, index.ntotal))

    D, I = index.search(embedding_array, top_k)
    resultados = montar_resultados(D[0], I[0])
    orcamento = calcular_orcamento(resultados)

    return {"orcamento": orcamento, "detalhes": resultados}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
