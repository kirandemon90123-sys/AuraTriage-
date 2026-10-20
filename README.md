# 🚨 AuraTriage (SirenSight)
### AI-Powered Emergency Co-Pilot & Real-Time Hospital Pre-Arrival Dispatcher

> **Hackathon MVP Submission**  
> Dual-hub telemetry bridge connecting pre-hospital emergency scenes with Trauma Resuscitation Centers in real time.

---

## ⚡ Executive Summary & Problem Statement

In time-critical emergencies—such as **Acute Ischemic Stroke**, **Severe Anaphylaxis**, and **Exsanguinating Hemorrhage**—patient outcomes hinge on minutes:
* *Time is Brain:* 1.9 million neurons die every minute an ischemic stroke goes untreated.
* *Pre-Arrival Blindness:* Emergency Departments (EDs) often operate in the dark, learning patient vitals only after the ambulance bays open.
* *Bystander Panic:* Family members and bystanders in distress struggle to recall critical first-aid measures.

**AuraTriage (SirenSight)** solves this with a two-sided telemetry platform:
1. **Patient Emergency Co-Pilot (`/patient`):** Panic-proof mobile PWA running real-time Computer Vision (MediaPipe FaceMesh) to detect facial asymmetry/droop, WebAudio acoustic airway analysis (identifying inspiratory stridor and tachypnea), automated Base64 snapshot capture, calm voice-assisted bystander first aid, and 1-tap fail-safe stage demo triggers.
2. **Hospital ED Pre-Arrival Command Dashboard (`/dashboard`):** Real-time trauma center monitor listening on WebSockets for incoming telemetry packets, triggering synthesized dual-tone alarms, streaming multimodal biometrics, and orchestrating condition-specific trauma team preparation checklists.
3. **Bidirectional Acknowledgment:** When the trauma team clicks **"Confirm Trauma Bay Ready"**, a live confirmation banner illuminates the patient's phone (`"🏥 METRO GENERAL ED: TRAUMA TEAM PREPARED & STANDING BY"`).

---

## 🏗️ System Architecture

```
                                  ┌────────────────────────────────┐
                                  │   PATIENT EMERGENCY CO-PILOT   │
                                  │       (frontend/patient.html)   │
                                  └───────────────┬────────────────┘
                                                  │
                                   WebCam & Mic   │  MediaPipe FaceMesh (Landmarks 33, 61, 263, 291)
                                   Sensory Stream │  WebAudio AnalyserNode (0-100 dB Stridor)
                                                  │  Compressed JPEG Telemetry Snapshot
                                                  ▼
                                 [ WebSocket: /ws/patient ]
                                                  │
                                                  ▼
                              ┌─────────────────────────────────────────┐
                              │  FASTAPI CLINICAL TRIAGE ENGINE        │
                              │             (backend/main.py)           │
                              │  • ESI-1 Level Assignment               │
                              │  • Condition-Specific Protocols        │
                              │  • Bystander Voice Synthesis Script     │
                              │  • 4-Point ED Trauma Prep Checklist     │
                              │  • REST Fallback (/api/dispatch)        │
                              └───────────────────┬─────────────────────┘
                                                  │
                                 [ WebSocket: /ws/hospital ]
                                                  │
                                                  ▼
                                  ┌────────────────────────────────┐
                                  │   HOSPITAL ED COMMAND CENTER   │
                                  │      (frontend/dashboard.html)  │
                                  └───────────────┬────────────────┘
                                                  │
                                                  │  Trauma Team Prepares Bay
                                                  │  Clicks "Confirm Trauma Bay Ready"
                                                  ▼
                         "🏥 METRO GENERAL ED: TRAUMA TEAM PREPARED & STANDING BY"
                                   (Echoed Bidirectionally to Patient)
```

---

## 🚀 Quickstart & Launch Commands

### Option A: Python FastAPI Backend (Port 8000)

```bash
# 1. Clone repository and navigate to root
git clone <repo-url>
cd AuraTriage

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Launch FastAPI with Uvicorn on Port 8000
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Once running, access:
* **Patient Emergency Co-Pilot:** [http://localhost:8000/patient](http://localhost:8000/patient)
* **Hospital ED Trauma Dashboard:** [http://localhost:8000/dashboard](http://localhost:8000/dashboard)
* **API Documentation & Swagger:** [http://localhost:8000/docs](http://localhost:8000/docs)
* **REST Fallback Dispatch:** `POST http://localhost:8000/api/dispatch`

---

### Option B: Node.js / Vite Full-Stack Dev Server (Port 3000)

```bash
# 1. Install Node dependencies
npm install

# 2. Start Vite development server (includes built-in WebSocket hubs & REST proxies)
npm run dev
```

Once running:
* **Stage Demo Hub (Dual Split View):** [http://localhost:3000/](http://localhost:3000/)
* **Standalone Patient App:** [http://localhost:3000/patient](http://localhost:3000/patient)
* **Standalone Hospital ED Monitor:** [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

---

## 🎯 Live Stage Demonstration Guide (3 Minutes)

1. **Open Split View:**
   Navigate to `http://localhost:3000/` (or open `/patient` on a phone and `/dashboard` on an external monitor).
2. **Observe Standby Radar:**
   Notice the Hospital Dashboard in radar sweep mode with *Trauma Bay 1: Standby*.
3. **Simulate Acute Stroke (Droop & Auto-Trigger):**
   * On the Patient Co-Pilot, drag the **Simulate Asymmetry** slider past `0.42` (or click `🧠 Stroke`).
   * Watch the MediaPipe vector indicator turn from green to crimson.
   * After 1.5 seconds, the system auto-triggers emergency dispatch.
4. **Experience Multimodal Alerting:**
   * The hospital dashboard blares an audible dual-tone WebAudio synthesizer chime (`960Hz / 770Hz`).
   * The camera snapshot, live GPS location, asymmetry ratio (`0.48`), and ETA countdown stream immediately.
   * On the patient's phone, high-contrast, panic-proof bystander steps appear and the calm voice co-pilot speaks instructions aloud via Web Speech API.
5. **Demonstrate Bidirectional Loop:**
   * On the Hospital Dashboard, check the items on the **ER Trauma Preparation Checklist** (e.g. Stroke Team paged, CT cleared, tPA pre-staged).
   * Click **"Confirm Trauma Bay Ready"**.
   * Instantaneously, the glowing banner illuminates on the patient's screen:  
     `"🏥 METRO GENERAL ED: TRAUMA TEAM PREPARED & STANDING BY"`.

---

## 📋 Clinical Protocols Supported

| Emergency | ESI Level | Biometric Trigger | ED Trauma Preparation Protocol |
| :--- | :--- | :--- | :--- |
| **Acute Ischemic Stroke** | `RED (ESI-1)` | Facial Asymmetry $\ge 0.42$ | CT/CTA neuro scanner cleared, IV tPA reconstituted, Stroke team paged |
| **Severe Anaphylaxis** | `RED (ESI-1)` | Airway Stridor $\ge 72 \text{ dB}$ | Video laryngoscope to bedside, IM Epinephrine 1:1,000, IV steroids |
| **Arterial Hemorrhage** | `RED (ESI-1)` | Exsanguinating trauma trigger | Massive Transfusion Protocol (MTP), 4U O-Neg PRBCs, OR-1 cleared |
| **Severe Thermal Burn** | `RED (ESI-1)` | Tachypnea & airway inhalation | Parkland formula LR fluid warmer, bronchoscopy, sterile burn drapes |

---

## 📦 Packaging for Submission

Run the bundler script to create the complete distribution zip:

```bash
python build_zip.py
```

Output: `AuraTriage_SirenSight.zip` containing all backend engines, frontends, unit tests, and configuration files with zero dead-ends.
