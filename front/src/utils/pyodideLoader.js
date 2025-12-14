// Pyodide loader for client-side Python execution
// Note: Pyodide does not fully support torch/torchaudio
// For source separation, TensorFlow.js or ONNX.js would be better alternatives

let pyodide = null;
let isLoading = false;
let loadPromise = null;

export async function loadPyodide() {
  if (pyodide) {
    return pyodide;
  }

  if (isLoading) {
    return loadPromise;
  }

  isLoading = true;
  loadPromise = (async () => {
    try {
      console.log("[Pyodide] Loading Pyodide...");
      // Use global loadPyodide from CDN
      if (typeof window.loadPyodide === 'undefined') {
        throw new Error("Pyodide not loaded. Make sure script tag is in index.html");
      }
      
      pyodide = await window.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/",
      });

      console.log("[Pyodide] Installing packages...");
      await pyodide.loadPackage(["micropip"]);
      
      // Install librosa and dependencies for audio analysis
      const micropip = pyodide.pyimport("micropip");
      await micropip.install([
        "librosa",
        "soundfile",
        "numpy",
      ]);

      console.log("[Pyodide] Pyodide ready!");
      return pyodide;
    } catch (error) {
      console.error("[Pyodide] Error loading Pyodide:", error);
      isLoading = false;
      loadPromise = null;
      throw error;
    }
  })();

  return loadPromise;
}

export function getPyodide() {
  return pyodide;
}

