// lib/api.js — Backend communication layer

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 300; // 10 minutes

export async function initSystem() {
  const pingRes = await fetch(`${API_BASE}/ping`);
  if (!pingRes.ok) throw new Error("Backend not responding");

  let hfSpaceUrl = "";
  const configRes = await fetch(`${API_BASE}/config`);
  if (configRes.ok) {
    const config = await configRes.json();
    hfSpaceUrl = config.hf_space_url || "";
  }
  return { hfSpaceUrl };
}

export async function analyzeTrack(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/analyze`, { method: "POST", body: formData });

  if (!res.ok) {
    let msg = "Analysis failed";
    try {
      const data = await res.json();
      msg = data.detail || data.error || msg;
    } catch {
      msg = `Analysis failed with status ${res.status}`;
    }
    throw new Error(msg);
  }

  const data = await res.json();
  if (!data || typeof data.bpm !== "number" || !data.key) {
    throw new Error("Invalid analysis response: missing required fields");
  }
  return data;
}

export async function startSeparation(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/separate`, { method: "POST", body: formData });

  if (!res.ok) {
    let msg = "Separation failed";
    try {
      const data = await res.json();
      msg = data.detail || data.error || msg;
    } catch {
      try { msg = await res.text(); } catch {}
    }
    throw new Error(msg);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export function pollJobStatus(jobId, baseUrl) {
  const url = baseUrl ? `${baseUrl}/job/${jobId}` : `${API_BASE}/job/${jobId}`;
  let attempts = 0;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      attempts++;
      if (attempts > MAX_POLL_ATTEMPTS) {
        reject(new Error("Separation timed out. Please try again."));
        return;
      }

      try {
        const res = await fetch(url);
        if (!res.ok) {
          if (res.status === 404) { reject(new Error("Job not found")); return; }
          throw new Error(`Status check failed: ${res.status}`);
        }

        const data = await res.json();
        if (data.status === "completed") { resolve(data); return; }
        if (data.status === "failed") { reject(new Error(data.error || "Separation failed")); return; }

        setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (attempts < 3) setTimeout(poll, POLL_INTERVAL_MS * 2);
        else reject(err);
      }
    };
    poll();
  });
}
