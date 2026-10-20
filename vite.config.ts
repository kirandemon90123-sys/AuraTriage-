import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig, type Plugin } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';

const CLINICAL_PROTOCOLS: Record<string, any> = {
  STROKE: {
    condition: 'STROKE',
    conditionName: 'Acute Ischemic Stroke (LVO Suspected)',
    esiLevel: 'RED - IMMEDIATE (ESI-1)',
    esiColor: '#dc2626',
    defaultEtaSeconds: 320,
    voiceScript:
      'Stroke emergency confirmed. Sit the patient upright at forty-five degrees. Do not give any food, water, or aspirin. Keep the patient calm. Emergency dispatch is alerted and hospital trauma team is standing by.',
    bystanderSteps: [
      'Sit patient upright at 30 to 45 degrees; do NOT give food, water, or aspirin.',
      'Note the exact time symptoms began (critical for tPA or thrombectomy time window).',
      'Loosen any tight clothing around neck; keep patient calm and completely still.',
      'If patient becomes unresponsive or vomits, immediately roll gently onto their left side in Recovery Position.',
    ],
    edChecklist: [
      'Code Stroke Team Paged & Neurointerventionalist on Standby',
      'CT / CTA Neuro Scanner Cleared & Radiologist Alerted',
      'IV tPA (Alteplase / Tenecteplase) Weight-Dosed & Reconstituted',
      'Point-of-Care Blood Glucose & Coagulation Panel Pre-Staged',
    ],
  },
  ANAPHYLAXIS: {
    condition: 'ANAPHYLAXIS',
    conditionName: 'Severe Systemic Anaphylaxis & Airway Compromise',
    esiLevel: 'RED - IMMEDIATE (ESI-1)',
    esiColor: '#dc2626',
    defaultEtaSeconds: 280,
    voiceScript:
      'Severe anaphylaxis detected. Administer epinephrine auto-injector immediately into the outer mid-thigh. Keep the patient flat with legs elevated. Airway trauma bay is prepped.',
    bystanderSteps: [
      'Administer Epinephrine Auto-Injector (EpiPen) immediately into outer mid-thigh.',
      'Keep patient lying flat with legs elevated unless breathing is severely labored.',
      'Remove known allergen trigger; do NOT allow patient to stand or walk.',
      'Prepare secondary epinephrine dose if no clinical improvement within 5 to 10 minutes.',
    ],
    edChecklist: [
      'Video Laryngoscope & Difficult Airway Cart to Bedside',
      'IM Epinephrine 1:1,000 (0.3mg) & IV Infusion Pump Primed',
      'IV Methylprednisolone (125mg) & Diphenhydramine (50mg) Ready',
      'High-Flow Non-Rebreather Mask / Nebulized Albuterol Operational',
    ],
  },
  HEMORRHAGE: {
    condition: 'HEMORRHAGE',
    conditionName: 'Severe Arterial Hemorrhage / Exsanguinating Trauma',
    esiLevel: 'RED - IMMEDIATE (ESI-1)',
    esiColor: '#dc2626',
    defaultEtaSeconds: 240,
    voiceScript:
      'Severe arterial hemorrhage. Apply direct, firm, continuous pressure immediately with clean cloth. If limb bleeding continues, apply tourniquet two inches above wound. Blood bank massive transfusion is pre-activated.',
    bystanderSteps: [
      'Apply direct, firm, continuous bilateral pressure over the bleeding site with sterile dressing.',
      'If arterial limb bleeding does not stop, apply tourniquet 2 to 3 inches above wound (never over a joint).',
      'Keep patient warm with jackets or blankets to prevent trauma-induced hypothermia and coagulopathy.',
      'Do NOT remove original gauze even if soaked through; layer fresh gauze on top and maintain constant pressure.',
    ],
    edChecklist: [
      'Massive Transfusion Protocol (MTP) Activated with Blood Bank',
      '4 Units Uncrossed O-Negative PRBCs & FFP to Trauma Bay 1',
      'Belmont Rapid Infuser & Blood Fluid Warmer Primed',
      'Trauma Surgery Attending & OR-1 Cleared for Damage Control',
    ],
  },
  BURN: {
    condition: 'BURN',
    conditionName: 'Severe Inhalation Thermal Injury / Cyanosis',
    esiLevel: 'RED - IMMEDIATE (ESI-1)',
    esiColor: '#dc2626',
    defaultEtaSeconds: 350,
    voiceScript:
      'Severe burn and airway trauma. Remove patient from heat source. Cool burns with clean room-temperature water. Do not apply ice. Cover loosely with sterile cloth. Trauma team ready.',
    bystanderSteps: [
      'Remove patient from fire or chemical source; ensure immediate airway patency.',
      'Cool burn area with clean room-temperature water for 10 to 15 minutes (never use ice or greasy ointments).',
      'Cover burn loosely with clean, non-adherent sterile dressing or plastic wrap.',
      'Elevate burned extremities above heart level if possible and monitor respiratory status closely.',
    ],
    edChecklist: [
      'Parkland Formula Resuscitation Calculated (Warm Lactated Ringers Pre-Staged)',
      'Fiberoptic Bronchoscopy Prepped for Inhalation Airway Assessment',
      'Sterile Burn Sheets & Forced-Air Bair Hugger Warming Blanket Placed',
      'Arterial Line Kit & Rapid ABG / Carboxyhemoglobin Cartridges Ready',
    ],
  },
};

function auraTriageBackendPlugin(): Plugin {
  return {
    name: 'auratriage-backend',
    configureServer(server) {
      const patientSockets = new Set<WebSocket>();
      const hospitalSockets = new Set<WebSocket>();
      let lastDossier: any = null;

      const wssPatient = new WebSocketServer({ noServer: true });
      const wssHospital = new WebSocketServer({ noServer: true });

      wssPatient.on('connection', (ws) => {
        patientSockets.add(ws);
        ws.send(
          JSON.stringify({
            type: 'connection_established',
            message: 'Connected to Metro General ED Hub',
            activeED: hospitalSockets.size,
          })
        );

        ws.on('message', (msg) => {
          try {
            const data = JSON.parse(msg.toString());
            if (data.type === 'telemetry' || data.type === 'emergency_dispatch') {
              const cond = (data.condition || 'STROKE').toUpperCase();
              const proto = CLINICAL_PROTOCOLS[cond] || CLINICAL_PROTOCOLS.STROKE;
              const dossier = {
                type: 'emergency_dossier',
                patientId: data.patientId || `PAT-${Math.floor(10000 + Math.random() * 90000)}`,
                timestamp: data.timestamp || new Date().toISOString(),
                condition: cond,
                conditionName: proto.conditionName,
                esiLevel: proto.esiLevel,
                esiColor: proto.esiColor,
                asymmetry: Number(data.asymmetry || 0),
                decibels: Number(data.decibels || 0),
                audioClass: data.audioClass || 'Normal Breathing',
                snapshot: data.snapshot || '',
                lat: data.lat || 37.7749,
                lon: data.lon || -122.4194,
                autoTriggered: !!data.autoTriggered,
                etaSeconds: data.etaSeconds || proto.defaultEtaSeconds,
                bystanderSteps: proto.bystanderSteps,
                voiceScript: proto.voiceScript,
                edChecklist: proto.edChecklist,
                status: 'DISPATCHED',
              };
              lastDossier = dossier;

              for (const h of hospitalSockets) {
                if (h.readyState === WebSocket.OPEN) {
                  h.send(JSON.stringify(dossier));
                }
              }

              ws.send(
                JSON.stringify({
                  type: 'dispatch_ack',
                  patientId: dossier.patientId,
                  status: 'RECEIVED_BY_ED',
                  condition: dossier.condition,
                })
              );
            }
          } catch (e) {
            console.error('Error in wssPatient message:', e);
          }
        });

        ws.on('close', () => patientSockets.delete(ws));
      });

      wssHospital.on('connection', (ws) => {
        hospitalSockets.add(ws);
        ws.send(
          JSON.stringify({
            type: 'connection_established',
            role: 'HOSPITAL_ED_MONITOR',
            activePatients: patientSockets.size,
          })
        );

        if (lastDossier) {
          ws.send(JSON.stringify(lastDossier));
        }

        ws.on('message', (msg) => {
          try {
            const data = JSON.parse(msg.toString());
            if (data.type === 'confirm_trauma_ready' || data.type === 'bay_ready') {
              const payload = {
                type: 'trauma_ready_confirmed',
                patientId: data.patientId || 'CURRENT_PATIENT',
                bay: data.bay || 'Trauma Resuscitation Bay 1',
                banner: '🏥 METRO GENERAL ED: TRAUMA TEAM PREPARED & STANDING BY',
                timestamp: new Date().toISOString(),
              };
              for (const p of patientSockets) {
                if (p.readyState === WebSocket.OPEN) {
                  p.send(JSON.stringify(payload));
                }
              }
              for (const h of hospitalSockets) {
                if (h.readyState === WebSocket.OPEN) {
                  h.send(JSON.stringify(payload));
                }
              }
            } else if (data.type === 'reset_emergency') {
              lastDossier = null;
              for (const h of hospitalSockets) {
                if (h.readyState === WebSocket.OPEN) {
                  h.send(JSON.stringify({ type: 'emergency_cleared' }));
                }
              }
              for (const p of patientSockets) {
                if (p.readyState === WebSocket.OPEN) {
                  p.send(JSON.stringify({ type: 'emergency_cleared' }));
                }
              }
            }
          } catch (e) {
            console.error('Error in wssHospital message:', e);
          }
        });

        ws.on('close', () => hospitalSockets.delete(ws));
      });

      // WebSocket Upgrade Router
      server.httpServer?.on('upgrade', (req, socket, head) => {
        const url = req.url || '';
        if (url.startsWith('/ws/patient')) {
          wssPatient.handleUpgrade(req, socket, head, (ws) => {
            wssPatient.emit('connection', ws, req);
          });
        } else if (url.startsWith('/ws/hospital')) {
          wssHospital.handleUpgrade(req, socket, head, (ws) => {
            wssHospital.emit('connection', ws, req);
          });
        }
      });

      // REST /api/dispatch fallback
      server.middlewares.use('/api/dispatch', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const cond = (data.condition || 'STROKE').toUpperCase();
              const proto = CLINICAL_PROTOCOLS[cond] || CLINICAL_PROTOCOLS.STROKE;
              const dossier = {
                type: 'emergency_dossier',
                patientId: data.patientId || `PAT-${Math.floor(10000 + Math.random() * 90000)}`,
                timestamp: data.timestamp || new Date().toISOString(),
                condition: cond,
                conditionName: proto.conditionName,
                esiLevel: proto.esiLevel,
                asymmetry: Number(data.asymmetry || 0),
                decibels: Number(data.decibels || 0),
                audioClass: data.audioClass || 'Normal Breathing',
                snapshot: data.snapshot || '',
                lat: data.lat || 37.7749,
                lon: data.lon || -122.4194,
                autoTriggered: !!data.autoTriggered,
                etaSeconds: data.etaSeconds || proto.defaultEtaSeconds,
                bystanderSteps: proto.bystanderSteps,
                voiceScript: proto.voiceScript,
                edChecklist: proto.edChecklist,
                status: 'DISPATCHED',
              };
              lastDossier = dossier;
              for (const h of hospitalSockets) {
                if (h.readyState === WebSocket.OPEN) {
                  h.send(JSON.stringify(dossier));
                }
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(dossier));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
        } else {
          res.statusCode = 405;
          res.end('Method Not Allowed');
        }
      });

      // REST /api/health
      server.middlewares.use('/api/health', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            status: 'healthy',
            service: 'AuraTriage (SirenSight)',
            patientsConnected: patientSockets.size,
            hospitalMonitorsConnected: hospitalSockets.size,
            timestamp: new Date().toISOString(),
          })
        );
      });

      // Serve standalone /patient page
      server.middlewares.use('/patient', (req, res, next) => {
        const filePath = path.resolve(__dirname, 'frontend/patient.html');
        if (fs.existsSync(filePath)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(fs.readFileSync(filePath, 'utf-8'));
          return;
        }
        next();
      });

      // Serve standalone /dashboard page
      server.middlewares.use('/dashboard', (req, res, next) => {
        const filePath = path.resolve(__dirname, 'frontend/dashboard.html');
        if (fs.existsSync(filePath)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(fs.readFileSync(filePath, 'utf-8'));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), auraTriageBackendPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
