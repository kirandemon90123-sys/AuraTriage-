"""
AuraTriage (SirenSight) - FastAPI Backend
Real-Time Emergency Co-Pilot & Pre-Arrival Hospital Trauma Dispatcher
"""

import json
import logging
import os
import time
from typing import Dict, List, Set, Any, Optional
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("AuraTriage")

app = FastAPI(
    title="AuraTriage (SirenSight) Emergency Dispatcher",
    description="Real-Time Clinical Telemetry & Hospital ED Pre-Arrival Hub",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# CLINICAL PROTOCOL ENGINE
# ---------------------------------------------------------

CLINICAL_PROTOCOLS = {
    "STROKE": {
        "condition": "STROKE",
        "conditionName": "Acute Ischemic Stroke (LVO Suspected)",
        "esiLevel": "RED - IMMEDIATE (ESI-1)",
        "esiColor": "#dc2626",
        "defaultEtaSeconds": 320,
        "voiceScript": (
            "Stroke emergency confirmed. Sit the patient upright at forty-five degrees. "
            "Do not give any food, water, or aspirin. Keep the patient calm. Emergency dispatch "
            "is alerted and hospital trauma team is standing by."
        ),
        "bystanderSteps": [
            "Sit patient upright at 30 to 45 degrees; do NOT give food, water, or aspirin.",
            "Note the exact time symptoms began (critical for tPA or thrombectomy time window).",
            "Loosen any tight clothing around neck; keep patient calm and completely still.",
            "If patient becomes unresponsive or vomits, immediately roll gently onto their left side in Recovery Position.",
        ],
        "edChecklist": [
            "Code Stroke Team Paged & Neurointerventionalist on Standby",
            "CT / CTA Neuro Scanner Cleared & Radiologist Alerted",
            "IV tPA (Alteplase / Tenecteplase) Weight-Dosed & Reconstituted",
            "Point-of-Care Blood Glucose & Coagulation Panel Pre-Staged",
        ],
    },
    "ANAPHYLAXIS": {
        "condition": "ANAPHYLAXIS",
        "conditionName": "Severe Systemic Anaphylaxis & Airway Compromise",
        "esiLevel": "RED - IMMEDIATE (ESI-1)",
        "esiColor": "#dc2626",
        "defaultEtaSeconds": 280,
        "voiceScript": (
            "Severe anaphylaxis detected. Administer epinephrine auto-injector immediately into "
            "the outer mid-thigh. Keep the patient flat with legs elevated. Airway trauma bay is prepped."
        ),
        "bystanderSteps": [
            "Administer Epinephrine Auto-Injector (EpiPen) immediately into outer mid-thigh.",
            "Keep patient lying flat with legs elevated unless breathing is severely labored.",
            "Remove known allergen trigger; do NOT allow patient to stand or walk.",
            "Prepare secondary epinephrine dose if no clinical improvement within 5 to 10 minutes.",
        ],
        "edChecklist": [
            "Video Laryngoscope & Difficult Airway Cart to Bedside",
            "IM Epinephrine 1:1,000 (0.3mg) & IV Infusion Pump Primed",
            "IV Methylprednisolone (125mg) & Diphenhydramine (50mg) Ready",
            "High-Flow Non-Rebreather Mask / Nebulized Albuterol Operational",
        ],
    },
    "HEMORRHAGE": {
        "condition": "HEMORRHAGE",
        "conditionName": "Severe Arterial Hemorrhage / Exsanguinating Trauma",
        "esiLevel": "RED - IMMEDIATE (ESI-1)",
        "esiColor": "#dc2626",
        "defaultEtaSeconds": 240,
        "voiceScript": (
            "Severe arterial hemorrhage. Apply direct, firm, continuous pressure immediately with clean cloth. "
            "If limb bleeding continues, apply tourniquet two inches above wound. Blood bank massive transfusion is pre-activated."
        ),
        "bystanderSteps": [
            "Apply direct, firm, continuous bilateral pressure over the bleeding site with sterile dressing.",
            "If arterial limb bleeding does not stop, apply tourniquet 2 to 3 inches above wound (never over a joint).",
            "Keep patient warm with jackets or blankets to prevent trauma-induced hypothermia and coagulopathy.",
            "Do NOT remove original gauze even if soaked through; layer fresh gauze on top and maintain constant pressure.",
        ],
        "edChecklist": [
            "Massive Transfusion Protocol (MTP) Activated with Blood Bank",
            "4 Units Uncrossed O-Negative PRBCs & FFP to Trauma Bay 1",
            "Belmont Rapid Infuser & Blood Fluid Warmer Primed",
            "Trauma Surgery Attending & OR-1 Cleared for Damage Control",
        ],
    },
    "BURN": {
        "condition": "BURN",
        "conditionName": "Severe Inhalation Thermal Injury / Cyanosis",
        "esiLevel": "RED - IMMEDIATE (ESI-1)",
        "esiColor": "#dc2626",
        "defaultEtaSeconds": 350,
        "voiceScript": (
            "Severe burn and airway trauma. Remove patient from heat source. Cool burns with clean "
            "room-temperature water. Do not apply ice. Cover loosely with sterile cloth. Trauma team ready."
        ),
        "bystanderSteps": [
            "Remove patient from fire or chemical source; ensure immediate airway patency.",
            "Cool burn area with clean room-temperature water for 10 to 15 minutes (never use ice or greasy ointments).",
            "Cover burn loosely with clean, non-adherent sterile dressing or plastic wrap.",
            "Elevate burned extremities above heart level if possible and monitor respiratory status closely.",
        ],
        "edChecklist": [
            "Parkland Formula Resuscitation Calculated (Warm Lactated Ringers Pre-Staged)",
            "Fiberoptic Bronchoscopy Prepped for Inhalation Airway Assessment",
            "Sterile Burn Sheets & Forced-Air Bair Hugger Warming Blanket Placed",
            "Arterial Line Kit & Rapid ABG / Carboxyhemoglobin Cartridges Ready",
        ],
    },
}

def enrich_telemetry(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    condition_key = (raw_data.get("condition") or "STROKE").upper()
    protocol = CLINICAL_PROTOCOLS.get(condition_key, CLINICAL_PROTOCOLS["STROKE"])

    patient_id = raw_data.get("patientId") or f"PAT-{int(time.time() * 1000) % 100000:05d}"
    timestamp = raw_data.get("timestamp") or datetime.utcnow().isoformat() + "Z"
    
    asymmetry = float(raw_data.get("asymmetry", 0.0))
    decibels = float(raw_data.get("decibels", 0.0))
    audio_class = raw_data.get("audioClass") or "Normal Breathing"
    snapshot = raw_data.get("snapshot") or ""
    lat = raw_data.get("lat", 37.7749)
    lon = raw_data.get("lon", -122.4194)
    auto_triggered = raw_data.get("autoTriggered", False)
    eta_seconds = int(raw_data.get("etaSeconds") or protocol["defaultEtaSeconds"])

    enriched = {
        "type": "emergency_dossier",
        "patientId": patient_id,
        "timestamp": timestamp,
        "condition": condition_key,
        "conditionName": protocol["conditionName"],
        "esiLevel": protocol["esiLevel"],
        "esiColor": protocol["esiColor"],
        "asymmetry": asymmetry,
        "decibels": decibels,
        "audioClass": audio_class,
        "snapshot": snapshot,
        "lat": lat,
        "lon": lon,
        "autoTriggered": auto_triggered,
        "etaSeconds": eta_seconds,
        "bystanderSteps": protocol["bystanderSteps"],
        "voiceScript": protocol["voiceScript"],
        "edChecklist": protocol["edChecklist"],
        "status": "DISPATCHED",
        "dispatchStation": "Metro General Hospital Trauma Center - ED Resuscitation Bay 1",
    }
    return enriched

# ---------------------------------------------------------
# WEBSOCKET CONNECTION MANAGERS
# ---------------------------------------------------------

class ConnectionHub:
    def __init__(self):
        self.patient_sockets: Set[WebSocket] = set()
        self.hospital_sockets: Set[WebSocket] = set()
        self.last_dossier: Optional[Dict[str, Any]] = None

    async def connect_patient(self, websocket: WebSocket):
        await websocket.accept()
        self.patient_sockets.add(websocket)
        logger.info(f"Patient connected. Total active patients: {len(self.patient_sockets)}")
        # Send current status
        await websocket.send_json({
            "type": "connection_established",
            "message": "Connected to Metro General Hospital Emergency Telemetry Hub",
            "activeEDConnections": len(self.hospital_sockets),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        })

    def disconnect_patient(self, websocket: WebSocket):
        self.patient_sockets.discard(websocket)
        logger.info(f"Patient disconnected. Total active patients: {len(self.patient_sockets)}")

    async def connect_hospital(self, websocket: WebSocket):
        await websocket.accept()
        self.hospital_sockets.add(websocket)
        logger.info(f"Hospital ED monitor connected. Total active monitors: {len(self.hospital_sockets)}")
        await websocket.send_json({
            "type": "connection_established",
            "role": "HOSPITAL_ED_MONITOR",
            "activePatients": len(self.patient_sockets),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        })
        # If there's an ongoing active emergency dossier, rehydrate the newly opened monitor
        if self.last_dossier:
            await websocket.send_json(self.last_dossier)

    def disconnect_hospital(self, websocket: WebSocket):
        self.hospital_sockets.discard(websocket)
        logger.info(f"Hospital ED monitor disconnected. Total active monitors: {len(self.hospital_sockets)}")

    async def broadcast_to_hospital(self, payload: Dict[str, Any]):
        dead_sockets = []
        for ws in self.hospital_sockets:
            try:
                await ws.send_json(payload)
            except Exception as e:
                logger.error(f"Error sending to hospital monitor: {e}")
                dead_sockets.append(ws)
        for dead in dead_sockets:
            self.hospital_sockets.discard(dead)

    async def broadcast_to_patient(self, payload: Dict[str, Any]):
        dead_sockets = []
        for ws in self.patient_sockets:
            try:
                await ws.send_json(payload)
            except Exception as e:
                logger.error(f"Error sending to patient client: {e}")
                dead_sockets.append(ws)
        for dead in dead_sockets:
            self.patient_sockets.discard(dead)

hub = ConnectionHub()

# ---------------------------------------------------------
# WEBSOCKET ENDPOINTS
# ---------------------------------------------------------

@app.websocket("/ws/patient")
async def websocket_patient_endpoint(websocket: WebSocket):
    await hub.connect_patient(websocket)
    try:
        while True:
            text = await websocket.receive_text()
            try:
                raw_data = json.loads(text)
            except json.JSONDecodeError:
                continue

            msg_type = raw_data.get("type", "telemetry")
            
            if msg_type in ("telemetry", "emergency_dispatch"):
                # Enrich and broadcast
                dossier = enrich_telemetry(raw_data)
                hub.last_dossier = dossier
                logger.info(f"Received telemetry from Patient {dossier['patientId']} - Condition: {dossier['condition']}")
                
                # Push to all hospital ED screens
                await hub.broadcast_to_hospital(dossier)

                # Send acknowledgment to the patient
                ack = {
                    "type": "dispatch_ack",
                    "patientId": dossier["patientId"],
                    "status": "RECEIVED_BY_ED",
                    "condition": dossier["condition"],
                    "voiceScript": dossier["voiceScript"],
                    "bystanderSteps": dossier["bystanderSteps"],
                    "esiLevel": dossier["esiLevel"],
                    "etaSeconds": dossier["etaSeconds"],
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "message": "Trauma telemetry received. Hospital trauma team is actively prepping.",
                }
                await websocket.send_json(ack)

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong", "timestamp": datetime.utcnow().isoformat() + "Z"})

    except WebSocketDisconnect:
        hub.disconnect_patient(websocket)
    except Exception as e:
        logger.error(f"Patient websocket error: {e}")
        hub.disconnect_patient(websocket)

@app.websocket("/ws/hospital")
async def websocket_hospital_endpoint(websocket: WebSocket):
    await hub.connect_hospital(websocket)
    try:
        while True:
            text = await websocket.receive_text()
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type", "")

            # When ED confirms Trauma Bay Ready
            if msg_type in ("confirm_trauma_ready", "bay_ready"):
                bay_id = data.get("bay", "Trauma Resuscitation Bay 1")
                patient_id = data.get("patientId", "CURRENT_PATIENT")
                timestamp = datetime.utcnow().isoformat() + "Z"
                
                confirmation_payload = {
                    "type": "trauma_ready_confirmed",
                    "patientId": patient_id,
                    "bay": bay_id,
                    "banner": "🏥 METRO GENERAL ED: TRAUMA TEAM PREPARED & STANDING BY",
                    "status": "BAY_CONFIRMED_READY",
                    "timestamp": timestamp,
                }
                logger.info(f"Trauma Bay Ready confirmed by ED for Patient {patient_id}")

                # Broadcast to all patients
                await hub.broadcast_to_patient(confirmation_payload)
                # Also synchronize across any other hospital ED dashboard monitors
                await hub.broadcast_to_hospital(confirmation_payload)

            elif msg_type == "reset_emergency":
                hub.last_dossier = None
                reset_payload = {
                    "type": "emergency_cleared",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }
                await hub.broadcast_to_hospital(reset_payload)
                await hub.broadcast_to_patient(reset_payload)

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong", "timestamp": datetime.utcnow().isoformat() + "Z"})

    except WebSocketDisconnect:
        hub.disconnect_hospital(websocket)
    except Exception as e:
        logger.error(f"Hospital websocket error: {e}")
        hub.disconnect_hospital(websocket)

# ---------------------------------------------------------
# REST FALLBACK & HEALTH ENDPOINTS
# ---------------------------------------------------------

class DispatchRequest(BaseModel):
    condition: str = Field(default="STROKE", description="Emergency condition (STROKE, ANAPHYLAXIS, HEMORRHAGE, BURN)")
    patientId: Optional[str] = None
    asymmetry: Optional[float] = 0.0
    decibels: Optional[float] = 0.0
    audioClass: Optional[str] = "Normal Breathing"
    snapshot: Optional[str] = ""
    lat: Optional[float] = 37.7749
    lon: Optional[float] = -122.4194
    autoTriggered: Optional[bool] = False
    timestamp: Optional[str] = None

@app.post("/api/dispatch")
async def api_dispatch(request: DispatchRequest):
    """REST Fallback endpoint for emergency dispatch when WebSockets are unavailable"""
    raw_dict = request.dict()
    dossier = enrich_telemetry(raw_dict)
    hub.last_dossier = dossier
    
    # Push to any active hospital WebSockets
    await hub.broadcast_to_hospital(dossier)
    return JSONResponse(status_code=200, content=dossier)

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "AuraTriage (SirenSight)",
        "activePatients": len(hub.patient_sockets),
        "activeHospitalMonitors": len(hub.hospital_sockets),
        "lastEmergency": hub.last_dossier["condition"] if hub.last_dossier else None,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

@app.get("/api/protocols")
async def get_protocols():
    return CLINICAL_PROTOCOLS

# ---------------------------------------------------------
# STATIC PAGE SERVING
# ---------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

@app.get("/patient")
async def serve_patient():
    path = os.path.join(FRONTEND_DIR, "patient.html")
    if os.path.exists(path):
        return FileResponse(path, media_type="text/html")
    return HTMLResponse("<h1>Patient app not found</h1>", status_code=404)

@app.get("/dashboard")
async def serve_dashboard():
    path = os.path.join(FRONTEND_DIR, "dashboard.html")
    if os.path.exists(path):
        return FileResponse(path, media_type="text/html")
    return HTMLResponse("<h1>Dashboard app not found</h1>", status_code=404)

# Serve frontend directory for assets if needed
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"\n🚀 AuraTriage (SirenSight) Starting on http://0.0.0.0:{port}")
    print(f"👉 Patient Emergency Co-Pilot: http://localhost:{port}/patient")
    print(f"👉 Hospital ED Trauma Monitor: http://localhost:{port}/dashboard\n")
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=True)
