1. Clone the repository:
   git clone <repository-url>   # Replace <repository-url> with the actual repository URL

2. Install dependencies:
   npm install

3. Build the project:
   npm run build

4. Integrate Transformer Models:
   Copy all files from the "@xenova/transformers/dist" directory into the project's "dist" folder.
   (Note: The reference topic in src/contentScript.js is hardcoded as "business". If you need a different topic, update it in the content script.)

5. Load the Extension in Chrome:
   - Open Chrome and go to chrome://extensions/
   - Enable "Developer mode"
   - Click "Load unpacked" and select the extension's root directory (ensure the "dist" folder is present)

6. Test the Extension:
   - Open your LinkedIn feed (https://www.linkedin.com/feed/)
   - The extension should now be active, processing posts based on the predefined configuration.
