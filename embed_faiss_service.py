from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import uvicorn
import torch
import torchvision.models as models
import torchvision.transforms as transforms
from PIL import Image
import numpy as np
import faiss
import io

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
embeddings_store = []  # lista para mapear ids
metadata_store = []    # ids ou paths das imagens

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
async def index_image(file: UploadFile = File(...), metadata: str = ""):
    img_bytes = await file.read()
    emb = get_embedding(img_bytes)
    index.add(emb)
    embeddings_store.append(emb)
    metadata_store.append(metadata)
    return {"message": "Indexed successfully", "metadata": metadata}

@app.post("/search")
async def search_image(file: UploadFile = File(...), top_k: int = 5):
    img_bytes = await file.read()
    emb = get_embedding(img_bytes)
    D, I = index.search(emb, top_k)
    results = []
    for dist, idx in zip(D[0], I[0]):
        if idx < len(metadata_store):
            results.append({"metadata": metadata_store[idx], "distance": float(dist)})
    return {"results": results}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
