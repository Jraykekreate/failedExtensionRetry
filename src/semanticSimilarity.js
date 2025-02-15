
import { pipeline, env } from '@xenova/transformers';
// =========================
// Monkey-Patching Network Requests
// =========================

// Intercept fetch responses and log any HTML responses.
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const response = await originalFetch.apply(this, args);
  // Clone the response so that reading its content won't consume the stream.
  const responseClone = response.clone();
  const contentType = responseClone.headers.get('content-type');
  if (contentType && contentType.includes('text/html')) {
    responseClone.text().then(html => {
      console.log("Intercepted HTML response (fetch):", html);
    }).catch(err => console.error("Error reading HTML response (fetch):", err));
  }
  return response;
};

// Intercept XMLHttpRequest responses and log any HTML responses.
(function () {
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, async, user, pass) {
    this.addEventListener('load', function () {
      const contentType = this.getResponseHeader("content-type");
      if (contentType && contentType.includes("text/html")) {
        console.log("Intercepted HTML response (XHR):", this.responseText);
      }
    });
    originalOpen.call(this, method, url, async, user, pass);
  };
})();

// =========================
// Semantic Similarity Code
// =========================

const modelURL = chrome.runtime.getURL('models/model/');
// Configure the environment: disable remote models and set the local model path.
env.allowRemoteModels = false;
env.useBrowserCache = false;
env.localModelPath = modelURL;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('/');
env.debug = true
env.logStats = true;
env.backends.onnx.logStats = true;
env.backends.onnx.wasm.logging = true;

// Begin loading the feature-extraction pipeline.
// This promise resolves once the model is loaded.
const featureExtractionPromise = pipeline('feature-extraction', './', {
  device: "cpu",
  quantized: false,
  cache: false
});

/**
 * Computes and returns a normalized, mean-pooled embedding for the provided text.
 * @param {string} text - The text to encode.
 * @returns {Promise<Float32Array>} A promise that resolves to the embedding vector.
 */
async function getEmbedding(text) {
  const pipe = await featureExtractionPromise;
  // Use pooling "mean" and normalization so the resulting vector is directly comparable.
  const result = await pipe(text, { pooling: 'mean', normalize: true });
  return result.data; // The embedding vector
}

/**
 * Calculates the cosine similarity between two vectors.
 * @param {number[]|TypedArray} vecA - The first vector.
 * @param {number[]|TypedArray} vecB - The second vector.
 * @returns {number} The cosine similarity score.
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of the same length');
  }
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Pure function to compute semantic similarity between two text strings.
 * @param {string} text1 - The first text.
 * @param {string} text2 - The second text.
 * @returns {Promise<number>} A promise that resolves to the cosine similarity score.
 */
export async function semanticSimilarity(text1, text2) {
  const [embedding1, embedding2] = await Promise.all([
    getEmbedding(text1),
    getEmbedding(text2)
  ]);
  return cosineSimilarity(embedding1, embedding2);
}


