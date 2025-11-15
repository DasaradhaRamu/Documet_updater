// src/App.jsx
import React, { useState, useCallback, useMemo } from 'react';
import './index.css';
import { Upload, FileText, Loader2, BookOpen, AlertCircle, Maximize2, ListChecks } from 'lucide-react';

const SUMMARY_GOALS = {
  executive: {
    title: "Executive Summary",
    systemInstruction: "Act as a professional business consultant. Provide a high-level executive summary focusing only on strategic implications, key financial outcomes, and next-step recommendations.",
    prompt: "Generate an Executive Summary from the document contents. The tone must be formal and concise."
  },
  key_findings: {
    title: "Key Findings & Data",
    systemInstruction: "Act as a meticulous research analyst. Extract the main data points, critical conclusions, and supporting evidence presented in the document, using a clean list format.",
    prompt: "Extract the key findings, main data points, and concrete evidence from the document. Present this information clearly in a bulleted list format."
  },
  simple: {
    title: "Simple Overview",
    systemInstruction: "Act as a helpful assistant. Provide a simple, straightforward, and easy-to-read summary of the document's main subject and contents, suitable for a general audience.",
    prompt: "Provide a simple overview summarizing the core subject matter of the document."
  }
};

const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000;
// Point to your local FastAPI server (avoid relative /api when not using Vite proxy)
const PROXY_URL = 'http://localhost:5200/api/summarize';

const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
};

const callSummarizerWithBackoff = async (payload, retries = 0) => {
  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      if (response.status === 429 && retries < MAX_RETRIES) {
        const delay = INITIAL_DELAY * Math.pow(2, retries) + Math.random() * 1000;
        console.warn(`Rate-limited. Retrying in ${Math.round(delay/1000)}s...`);
        await new Promise(r => setTimeout(r, delay));
        return callSummarizerWithBackoff(payload, retries + 1);
      }
      if (response.status === 403) {
        const text = await response.text().catch(() => '');
        console.error('403 response body from proxy:', text);
        throw new Error('API Error: (403) Forbidden — check server logs and server configuration.');
      }
      if (response.status === 404) {
        const text = await response.text().catch(() => '');
        console.error('404 response body from proxy:', text);
        throw new Error('API Error: Not Found (404). Ensure the backend server is running on port 5200.');
      }
      throw new Error(`API Error: ${response.statusText} (${response.status})`);
    }

    const result = await response.json();

    // New local backend returns { summary: "..." }. Fall back to legacy path if present.
    const generatedText = result?.summary ?? result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      console.error('Unexpected API response shape:', result);
      throw new Error("Failed to extract summary text from the API response.");
    }
    return generatedText;
  } catch (error) {
    throw error;
  }
};

const App = () => {
  const [file, setFile] = useState(null);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summaryGoal, setSummaryGoal] = useState('executive');
  const [isDragActive, setIsDragActive] = useState(false);

  const handleFileChange = useCallback((uploadedFile) => {
    if (uploadedFile) {
      setFile(uploadedFile);
      setError('');
      setSummary('');
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  }, [handleFileChange]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!file) {
      setError('Please upload a document (PDF, JPG, or PNG) to start.');
      return;
    }

    const config = SUMMARY_GOALS[summaryGoal];
    setLoading(true);
    setSummary('');
    setError('');

    try {
      const base64Data = await fileToBase64(file);
      const finalPrompt = `Document: ${file.name}. Task: ${config.prompt}`;
      const systemPrompt = config.systemInstruction;

      const payload = {
        contents: [{
          role: "user",
          parts: [
            { text: finalPrompt },
            {
              inlineData: {
                mimeType: file.type,
                data: base64Data
              }
            }
          ]
        }],
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        }
      };

      const generatedSummary = await callSummarizerWithBackoff(payload);
      setSummary(generatedSummary);
    } catch (err) {
      console.error('Summarization error:', err);
      const friendlyMsg = err.message?.includes('403')
        ? 'Summarization failed: API Error (403). Check server logs and ensure the server is running correctly.'
        : err.message?.includes('404')
        ? 'Summarization failed: Backend not found (404). Start the server on port 5200.'
        : `Summarization failed: ${err.message}`;
      setError(friendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  const dropZoneClasses = useMemo(() => {
    let classes = "drop-zone border-2 border-dashed transition-all duration-300 p-8 rounded-xl text-center cursor-pointer min-h-[150px] flex flex-col items-center justify-center";
    if (file) classes += ' has-file border-indigo-500 bg-indigo-50 text-indigo-700 shadow-md';
    else if (isDragActive) classes += ' dragging border-indigo-400 bg-indigo-100 scale-[1.01] shadow-lg';
    else classes += ' border-gray-300 hover:border-indigo-400 hover:bg-gray-50';
    return classes;
  }, [file, isDragActive]);

  return (
    <div className="app-shell">
      <div className="card">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-gray-900 flex items-center justify-center gap-3">
            <BookOpen className="h-8 w-8 text-indigo-600" />
            AI Document Analyst
          </h1>
          <p className="text-gray-500 mt-2 text-lg">
            Summarize PDFs, reports, and images using a local summarizer (no external AI).
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="p-4 border-b border-gray-200">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span className="bg-indigo-600 text-white rounded-full h-8 w-8 flex items-center justify-center text-sm font-bold">1</span>
              Upload Document
            </h2>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`${dropZoneClasses} ${file ? 'has-file' : ''} ${isDragActive ? 'dragging' : ''}`}
              onClick={() => document.getElementById('file-upload').click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') document.getElementById('file-upload').click(); }}
              aria-label="Upload document"
            >
              <input
                type="file"
                id="file-upload"
                onChange={(e) => handleFileChange(e.target.files[0])}
                accept=".pdf,image/jpeg,image/png"
                className="hidden"
              />
              <Upload className={`h-10 w-10 mb-3 ${file ? 'text-indigo-600' : 'text-gray-400'}`} />
              <p className={`text-lg font-semibold ${file ? 'text-indigo-700' : 'text-gray-700'}`}>
                {file ?
                  <span className="flex items-center gap-2">
                    <FileText className="h-5 w-5"/> <span className="file-name">{file.name}</span>
                  </span>
                  : 'Drag & Drop or Click to Upload (PDF, JPG, PNG)'}
              </p>
            </div>

            {error && (
              <div className="alert" role="alert" aria-live="polite">
                <AlertCircle className="h-5 w-5 flex-shrink-0"/>
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}
          </section>

          <section className="p-4 border-b border-gray-200">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span className="bg-indigo-600 text-white rounded-full h-8 w-8 flex items-center justify-center text-sm font-bold">2</span>
              Define Summarization Goal
            </h2>
            <div className="controls">
              <div className="flex-grow">
                <label htmlFor="summary-goal" className="block text-sm font-medium text-gray-700 mb-2">
                  Select Target Output:
                </label>
                <select
                  id="summary-goal"
                  value={summaryGoal}
                  onChange={(e) => setSummaryGoal(e.target.value)}
                  className="w-full border border-gray-300 bg-white text-gray-800 rounded-lg p-3 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm"
                  disabled={loading}
                >
                  {Object.entries(SUMMARY_GOALS).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  This dictates the summarizer's output style.
                </p>
              </div>

              <button
                type="submit"
                disabled={!file || loading}
                className="submit-button"
                aria-disabled={!file || loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-5 w-5" />
                    Generate Summary
                  </>
                )}
              </button>
            </div>
          </section>
        </form>

        {summary && (
          <section className="summary-section mt-8 pt-6 border-t border-gray-200">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <ListChecks className="h-6 w-6 text-indigo-600"/> 
              Generated {SUMMARY_GOALS[summaryGoal].title}
            </h2>

            <div className="summary-card">
              <pre className="summary-text">{summary}</pre>
              <p className="summary-meta">Generated by Local Summarizer</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default App;
