import os
import base64
from io import BytesIO
from google import genai
from google.genai import types

def get_summary(base64_data: str, mime_type: str, system_instruction: str, prompt: str) -> str:
    """
    Calls the Gemini API to analyze and summarize a document (image or PDF).

    Args:
        base64_data: The Base64 encoded content of the file.
        mime_type: The MIME type of the file (e.g., 'application/pdf', 'image/jpeg').
        system_instruction: The instruction defining the model's persona.
        prompt: The specific task/query for the model.

    Returns:
        The generated summary text.
    """
    # 1. Initialize the client securely
    # In a production environment, the API key would be loaded from an environment variable.
    # client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    # NOTE: Since this is a simulated backend, we'll assume the client is configured.
    # For actual execution in a self-hosted environment, ensure the GEMINI_API_KEY is set.
    
    # 2. Decode the Base64 data
    try:
        file_bytes = base64.b64decode(base64_data)
    except base64.binascii.Error:
        return "Error: Invalid Base64 data received."

    # 3. Construct the API payload parts
    
    # A. Multimodal Part (File)
    document_part = types.Part.from_bytes(
        data=file_bytes,
        mime_type=mime_type,
    )
    
    # B. Text Part (Prompt)
    text_part = types.Part.from_text(prompt)

    # 4. Configure the model
    config = types.GenerateContentConfig(
        system_instruction=system_instruction
    )
    
    # 5. Call the API (using a synchronous call for simplicity)
    # The response is simplified for this example.
    # try:
    #     response = client.models.generate_content(
    #         model='gemini-2.5-flash',
    #         contents=[document_part, text_part],
    #         config=config
    #     )
    #     return response.text
    # except Exception as e:
    #     # Log detailed error on the server
    #     print(f"Gemini API Error: {e}")
    #     return "An error occurred while communicating with the AI service."

    # --- SIMULATED RESPONSE FOR DEMO PURPOSES ---
    print(f"Simulating API call for MIME Type: {mime_type}")
    print(f"Using System Instruction: {system_instruction[:50]}...")
    return f"[[Simulated response from Python service for prompt: {prompt}]]\n\nThe actual full summary would be generated here by the Gemini API, securely on the server."

if __name__ == '__main__':
    # Example usage:
    # This requires a valid Base64 string of a file to run properly.
    # For demonstration, we'll use placeholder data.
    
    example_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" # 1x1 black PNG
    example_mime = "image/png"
    example_sys_instr = "Act as a helpful assistant."
    example_prompt = "What is this image?"
    
    print("--- Running Python Backend Simulation ---")
    
    # summary_result = get_summary(
    #     base64_data=example_b64,
    #     mime_type=example_mime,
    #     system_instruction=example_sys_instr,
    #     prompt=example_prompt
    # )
    # print("\nResult:\n", summary_result)
    
    print("\nNote: Python code execution is simulated. The React app performs the real API call via Fetch (JavaScript).")