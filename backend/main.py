from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta
import numpy as np
import random

app = FastAPI(title="Fish Prediction API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://astryx-app.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = "change-this-secret-key-later"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

users_db = {}
zones_db = {}
catch_logs_db = {}

class UserSignup(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class PredictRequest(BaseModel):
    lat: float
    lon: float

class ZoneCreate(BaseModel):
    name: str
    lat: float
    lon: float

class CatchLogCreate(BaseModel):
    lat: float
    lon: float
    date: str
    species: str
    quantity: float
    notes: str = ""

def create_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email is None or email not in users_db:
            raise HTTPException(status_code=401, detail="Invalid token")
        return users_db[email]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}

@app.post("/api/auth/signup")
def signup(user: UserSignup):
    if user.email in users_db:
        raise HTTPException(status_code=400, detail="Email already registered")
    users_db[user.email] = {
        "name": user.name,
        "email": user.email,
        "hashed_password": pwd_context.hash(user.password),
    }
    zones_db[user.email] = []
    catch_logs_db[user.email] = []
    token = create_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer", "name": user.name}

@app.post("/api/auth/login")
def login(user: UserLogin):
    db_user = users_db.get(user.email)
    if not db_user or not pwd_context.verify(user.password, db_user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer", "name": db_user["name"]}

@app.get("/api/auth/me")
def me(current_user: dict = Depends(get_current_user)):
    return {"name": current_user["name"], "email": current_user["email"]}

def simulate_ocean_data(lat: float, lon: float):
    seed = int(abs(lat * 1000 + lon * 1000)) % 100000
    rng = random.Random(seed)
    temperature = round(rng.uniform(15, 30), 2)
    chlorophyll = round(rng.uniform(0.1, 5.0), 2)
    turbidity = round(rng.uniform(0, 10), 2)
    wind_speed = round(rng.uniform(0, 20), 2)
    wind_direction = round(rng.uniform(0, 360), 1)
    return {
        "lat": lat,
        "lon": lon,
        "temperature": temperature,
        "chlorophyll": chlorophyll,
        "turbidity": turbidity,
        "wind_speed": wind_speed,
        "wind_direction": wind_direction,
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/api/ocean-data")
def ocean_data(lat: float, lon: float):
    return simulate_ocean_data(lat, lon)

def calculate_fish_score(data: dict):
    temp = data["temperature"]
    temp_score = max(0, 1 - abs(temp - 22.5) / 15)
    turbidity_score = max(0, 1 - data["turbidity"] / 10)
    chlorophyll_score = min(1, data["chlorophyll"] / 3)
    wind_score = max(0, 1 - abs(data["wind_speed"] - 8) / 15)
    direction_score = 0.5 + 0.5 * float(np.cos(np.radians(data["wind_direction"])))
    seasonal_score = 0.5 + 0.5 * float(np.sin(datetime.utcnow().timetuple().tm_yday / 365 * 2 * np.pi))

    breakdown = {
        "Temperature": round(float(temp_score) * 100, 1),
        "Turbidity": round(float(turbidity_score) * 100, 1),
        "Chlorophyll": round(float(chlorophyll_score) * 100, 1),
        "Wind Speed": round(float(wind_score) * 100, 1),
        "Wind Direction": round(float(direction_score) * 100, 1),
        "Seasonal": round(float(seasonal_score) * 100, 1),
    }

    score = (
        temp_score * 0.35
        + turbidity_score * 0.20
        + chlorophyll_score * 0.15
        + wind_score * 0.15
        + direction_score * 0.10
        + seasonal_score * 0.05
    )
    return round(float(score) * 100, 1), breakdown

@app.post("/api/predict-fish")
def predict_fish(req: PredictRequest):
    data = simulate_ocean_data(req.lat, req.lon)
    score, breakdown = calculate_fish_score(data)
    if score >= 70:
        level = "High"
    elif score >= 40:
        level = "Medium"
    else:
        level = "Low"
    return {
        "lat": req.lat,
        "lon": req.lon,
        "probability": score,
        "level": level,
        "factors": data,
        "breakdown": breakdown,
    }

@app.get("/api/map-data")
def map_data(bounds: str):
    try:
        south, west, north, east = [float(x) for x in bounds.split(",")]
    except Exception:
        raise HTTPException(status_code=400, detail="bounds must be south,west,north,east")

    points = []
    steps = 6
    for i in range(steps):
        for j in range(steps):
            lat = south + (north - south) * i / (steps - 1)
            lon = west + (east - west) * j / (steps - 1)
            data = simulate_ocean_data(lat, lon)
            score, _ = calculate_fish_score(data)
            points.append({"lat": round(lat, 4), "lon": round(lon, 4), "score": score, **data})
    return {"points": points}

@app.get("/api/statistics")
def statistics():
    return {
        "total_predictions": 1284,
        "high_probability_zones": 312,
        "average_score": 58.4,
        "regions": [
            {"name": "North Zone", "avg_score": 62.1, "predictions": 410},
            {"name": "South Zone", "avg_score": 55.3, "predictions": 380},
            {"name": "East Zone", "avg_score": 59.8, "predictions": 290},
            {"name": "West Zone", "avg_score": 54.0, "predictions": 204},
        ],
    }

@app.get("/api/reports")
def reports():
    demo_reports = []
    for i in range(10):
        demo_reports.append({
            "id": i + 1,
            "date": (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d"),
            "lat": round(random.uniform(35, 45), 4),
            "lon": round(random.uniform(-10, 10), 4),
            "score": round(random.uniform(20, 95), 1),
            "level": random.choice(["High", "Medium", "Low"]),
        })
    return {"reports": demo_reports}

@app.post("/api/zones")
def create_zone(zone: ZoneCreate, current_user: dict = Depends(get_current_user)):
    email = current_user["email"]
    zones_db.setdefault(email, [])
    new_id = (max([z["id"] for z in zones_db[email]], default=0)) + 1
    entry = {"id": new_id, "name": zone.name, "lat": zone.lat, "lon": zone.lon}
    zones_db[email].append(entry)
    return entry

@app.get("/api/zones")
def list_zones(current_user: dict = Depends(get_current_user)):
    email = current_user["email"]
    result = []
    for z in zones_db.get(email, []):
        data = simulate_ocean_data(z["lat"], z["lon"])
        score, _ = calculate_fish_score(data)
        result.append({**z, "score": float(score), "alert": bool(score >= 70)})
    return {"zones": result}

@app.delete("/api/zones/{zone_id}")
def delete_zone(zone_id: int, current_user: dict = Depends(get_current_user)):
    email = current_user["email"]
    zones_db[email] = [z for z in zones_db.get(email, []) if z["id"] != zone_id]
    return {"ok": True}

@app.post("/api/catch-log")
def create_catch_log(entry: CatchLogCreate, current_user: dict = Depends(get_current_user)):
    email = current_user["email"]
    catch_logs_db.setdefault(email, [])
    data = simulate_ocean_data(entry.lat, entry.lon)
    predicted_score, _ = calculate_fish_score(data)
    new_id = (max([c["id"] for c in catch_logs_db[email]], default=0)) + 1
    record = {
        "id": new_id,
        "lat": entry.lat,
        "lon": entry.lon,
        "date": entry.date,
        "species": entry.species,
        "quantity": entry.quantity,
        "notes": entry.notes,
        "predicted_score": float(predicted_score),
    }
    catch_logs_db[email].append(record)
    return record

@app.get("/api/catch-log")
def list_catch_log(current_user: dict = Depends(get_current_user)):
    email = current_user["email"]
    return {"logs": catch_logs_db.get(email, [])}

WARMING_RATE_C_PER_YEAR = 0.025

@app.get("/api/climate-forecast")
def climate_forecast(lat: float, lon: float):
    base_data = simulate_ocean_data(lat, lon)
    base_score, _ = calculate_fish_score(base_data)

    current_year = datetime.utcnow().year
    horizons = [0, 5, 10, 25, 50]
    projections = []
    for y in horizons:
        future_data = dict(base_data)
        future_data["temperature"] = base_data["temperature"] + WARMING_RATE_C_PER_YEAR * y
        future_score, _ = calculate_fish_score(future_data)
        projections.append({
            "year": current_year + y,
            "years_ahead": y,
            "projected_temp": round(future_data["temperature"], 2),
            "projected_score": float(future_score),
        })

    decline = round(float(base_score - projections[-1]["projected_score"]), 1)
    if decline < 10:
        sustainability_index = "Stable"
    elif decline < 25:
        sustainability_index = "Moderate Risk"
    else:
        sustainability_index = "High Risk"

    recommended_now = round(base_score / 100 * 500)
    recommended_future = round(projections[-1]["projected_score"] / 100 * 500)

    return {
        "lat": lat,
        "lon": lon,
        "current_score": float(base_score),
        "projections": projections,
        "sustainability_index": sustainability_index,
        "decline_50y": decline,
        "recommended_max_annual_catch_tons_now": recommended_now,
        "recommended_max_annual_catch_tons_in_50y": recommended_future,
    }
