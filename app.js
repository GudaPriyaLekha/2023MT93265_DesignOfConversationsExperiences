// Import dependencies
const { OpenAI } = require("openai");
const { Configuration } = require("openai");
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require("sharp");
const { BlobServiceClient } = require("@azure/storage-blob");
require("dotenv").config(); // Load environment variables from .env file

const Sentiment = require("sentiment");
const sentiment = new Sentiment();

// const { BlobServiceClient } = require("@azure/storage-blob");
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, //.env file contains the correct API key
});

// Express setup
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const multer = require("multer") //for file uploads

const app = express();
const port = 3000;

// Configure multer for image upload
const upload = multer({ dest: "uploads/" });

// Middleware
app.use(bodyParser.json());
app.use(cors());

app.use(express.static('public'));  // index.html is in 'public' folder

// Root route (GET /)
app.get("/", (req, res) => {
    res.send("Welcome to the AI Chatbot Server!");
});

// POST route for text generation
app.post("/generate", async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).send({ error: "Prompt is required" });
    }

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",  // Model selection
            messages: [{ role: "user", content: prompt }],
        });
        res.send({ result: response.choices[0].message.content.trim() });
    } catch (error) {
        console.error("Error generating text:", error.message);
        res.status(500).send({ error: "Failed to generate text" });
    }
});

app.post("/speech-to-text", async (req, res) => {
    const { audioUrl } = req.body;

    if (!audioUrl) {
        return res.status(400).send({ error: "Audio URL is required" });
    }

    try {
        // Send the audio URL to AssemblyAI API to initiate transcription
        const response = await axios.post('https://api.assemblyai.com/v2/transcript', 
            { audio_url: audioUrl }, 
            { headers: { 'authorization': process.env.ASSEMBLYAI_API_KEY } }
        );

        const transcriptionId = response.data.id;
        res.send({ transcriptionId });
    } catch (error) {
        
        console.error("Error in speech-to-text:", error.message);
        res.status(500).send({ error: "Failed to transcribe speech" });
    }
});

// New route to check transcription status and get the result
app.get("/transcription-result/:id", async (req, res) => {
    const transcriptionId = req.params.id;  // Get transcription ID from the URL

    if (!transcriptionId) {
        return res.status(400).send({ error: "Transcription ID is required" });
    }

    try {
        // Get the transcription status from AssemblyAI
        const response = await axios.get(`https://api.assemblyai.com/v2/transcript/${transcriptionId}`, {
            headers: {
                'authorization': process.env.ASSEMBLYAI_API_KEY,
            },
        });

        const status = response.data.status;

        if (status === 'completed') {
            // If transcription is complete, return the text
            res.send({ transcription: response.data.text });
        } else if (status === 'failed') {
            // If transcription failed, send an error
            res.status(500).send({ error: 'Transcription failed' });
        } else {
            // If still processing, send a message saying so
            res.send({ status: 'Processing... Please try again later.' });
        }
    } catch (error) {
        console.error("Error getting transcription result:", error.message);
        res.status(500).send({ error: "Failed to get transcription result" });
    }
});

app.use(express.json());

// Define your AssemblyAI API key
const assemblyAIKey = ''; 

app.use(express.urlencoded({ extended: true })); // For URL-encoded bodies

app.post("/image-classify", (req, res) => {
    const { imageUrl } = req.body;

    if (!imageUrl) {
        return res.status(400).send({ error: "Image URL is required" });
    }

    // Process image classification (mock logic here)
    const mockLabels = ["Cat", "Dog", "Bird"];
    const randomLabel = mockLabels[Math.floor(Math.random() * mockLabels.length)];

    res.send({ classification: randomLabel });
});

 app.post("/summarize", async (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.status(400).send({ error: "Text is required" });
    }

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are a summarization assistant." },
                { role: "user", content: `Summarize the following text:\n${text}` }
            ],
        });

        const summary = response.choices[0].message.content.trim();
        res.send({ summary });
    } catch (error) {
        console.error("Error in summarizing text:", error.message);
        res.status(500).send({ error: "Failed to summarize text" });
    }
});

app.post("/enhance-image", async (req, res) => {
    const { imageUrl } = req.body; // Get the image URL from the request body

    if (!imageUrl) {
        return res.status(400).send({ error: "Image URL is required" });
    }

    try {
        // Download the image from the provided URL
        const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
        const imageBuffer = Buffer.from(response.data);

        // Process the image (e.g., resize or enhance)
        const enhancedImageBuffer = await sharp(imageBuffer)
            .resize(800, 800) // Resize to 800x800 pixels
            .toFormat("jpeg") // Convert to JPEG format
            .jpeg({ quality: 90 }) // Set quality to 90%
            .toBuffer();

        // Save the enhanced image locally
        const enhancedImagePath = path.join(__dirname, "enhanced_images", "enhanced_image.jpg");
        fs.writeFileSync(enhancedImagePath, enhancedImageBuffer);

        // Return the response with the enhanced image path
        res.send({
            message: "Image enhanced successfully",
            enhancedImagePath,
        });
    } catch (error) {
        console.error("Error enhancing the image:", error.message);
        res.status(500).send({ error: "Failed to enhance the image" });
    }
});

app.post("/analyze-sentiment", (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: "Text is required" });
    }

    // Perform sentiment analysis
    const result = sentiment.analyze(text);

    // Determine sentiment
    let sentimentResult = "Neutral";
    if (result.score > 0) {
        sentimentResult = "Positive";
    } else if (result.score < 0) {
        sentimentResult = "Negative";
    }

    res.json({
        sentiment: sentimentResult,
        score: result.score, // Score of sentiment
    });
});

const downloadDataset = async (containerName, blobName) => {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(blobName);
    const downloadBlockBlobResponse = await blobClient.download(0);
    
    const data = await streamToText(downloadBlockBlobResponse.readableStreamBody);
    return JSON.parse(data); // Assuming your dataset is in JSON format
  };
  
  const streamToText = (readableStream) => {
    return new Promise((resolve, reject) => {
      let data = '';
      readableStream.on('data', chunk => {
        data += chunk;
      });
      readableStream.on('end', () => {
        resolve(data);
      });
      readableStream.on('error', reject);
    });
  };

  const FormData = require('form-data');
// const fs = require('fs');
// const axios = require('axios');

app.post('/fine-tune', async (req, res) => {
    const { filePath } = req.body;  // filePath should be the local file path from which we need to fine-tune

    if (!filePath) {
        return res.status(400).send({ error: "File path is required" });
    }

    // Ensure the file exists
    if (!fs.existsSync(filePath)) {
        return res.status(404).send({ error: "File not found at the specified path" });
    }

    try {
        // Create a new FormData instance
        const form = new FormData();

        // Append the local file to the form data
        form.append('file', fs.createReadStream(filePath));
        
        // Append the 'purpose' field as 'fine-tune'
        form.append('purpose', 'fine-tune');

        // Set the API endpoint and headers for the fine-tuning request
        const fineTuneRequest = {
            method: 'post',
            url: 'https://api.openai.com/v1/files',  // OpenAI fine-tuning file upload endpoint
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,  // Add the OpenAI API key from your environment
            },
            data: form,  // Attach form data with the file
        };

        // Make the POST request to OpenAI to upload the file for fine-tuning
        const response = await axios(fineTuneRequest);

        // If successful, return the response from OpenAI API
        res.send(response.data);
    } catch (error) {
        console.error("Error uploading file for fine-tuning:", error.response?.data || error.message);
        res.status(500).send({ error: "Failed to upload file for fine-tuning" });
    }
});
  

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

// app.post("/classify-image", async (req, res) => {
//     const { imagePath } = req.body;

//     if (!imagePath) {
//         return res.status(400).send({ error: "Image URL or path is required" });
//     }

//     try {

//         const response = await axios.get(imagePath, { responseType: 'arraybuffer' });

//         const imageBuffer = Buffer.from(response.data);
//         const processedImageBuffer = await sharp(imageBuffer)
//             .resize(224, 224)
//             .toBuffer();

//         const classificationResult = await ImageClassificationModel.classify(processedImageBuffer);

//         res.send({
//             message: "Image classified successfully",
//             classificationResult: classificationResult
//         });
//     } catch (error) {
//         console.error("Error during image classification:", error.message);
//         res.status(500).send({ error: "Failed to classify image" });
//     }
// });

// const configuration = new Configuration({
//     apiKey: '',
// });

// async function uploadDataset(datasetFilePath) {
//     const file = fs.createReadStream(datasetFilePath);
//     try {
//       const response = await openai.createFile(file, 'fine-tune');
//       return response.data.id;
//     } catch (error) {
//       console.error("Error uploading dataset:", error.message);
//       throw new Error("Dataset upload failed");
//     }
//   }
  
//   async function fineTuneModel(fileId) {
//     try {
//       const fineTuneResponse = await openai.createFineTune({
//         training_file: fileId,
//       });
//       return fineTuneResponse.data;
//     } catch (error) {
//       console.error("Error during fine-tuning:", error.message);
//       throw new Error("Fine-tuning failed");
//     }
//   }
  
//   app.post('/fine-tune', async (req, res) => {
//     const { datasetFilePath } = req.body;
  
//     if (!datasetFilePath) {
//       return res.status(400).send({ error: "Dataset file path is required" });
//     }
  
//     try {
//       const fileId = await uploadDataset(datasetFilePath);
//       const fineTuneResponse = await fineTuneModel(fileId);
//       res.send(fineTuneResponse);
//     } catch (error) {
//       console.error('Error during fine-tuning:', error.message);
//       res.status(500).send({ error: 'Failed to fine-tune the model' });
//     }
//   });

// POST route for Text-to-Speech (Converts text to speech)
// app.post("/text-to-speech", async (req, res) => {
//     const { text } = req.body;

//     if (!text) {
//         return res.status(400).send({ error: "Text is required" });
//     }

//     try {
//         // Send text to AssemblyAI API for text-to-speech conversion
//         const response = await axios.post(
//             'https://api.assemblyai.com/v2/text-to-speech',
//             { text: text }, // The text to convert to speech
//             {
//                 headers: {
//                     'Authorization': assemblyAIKey, // Include the API key
//                     'Content-Type': 'application/json'
//                 }
//             }
//         );

//         // Handle response from AssemblyAI API
//         if (response.status === 200 && response.data && response.data.audio_url) {
//             const audioUrl = response.data.audio_url;

//             // Download the audio file from the URL
//             const audioResponse = await axios.get(audioUrl, { responseType: 'arraybuffer' });

//             // Define the path where you want to save the audio file locally
//             const filePath = path.join(__dirname, 'audio_files', 'output_audio.mp3'); // Set your local path here

//             // Save the audio file locally
//             fs.writeFileSync(filePath, audioResponse.data);

//             res.send({
//                 message: 'Audio file generated and saved',
//                 filePath: filePath // Return the local file path
//             });
//         } else {
//             res.status(500).send({ error: 'Failed to generate speech' });
//         }
//     } catch (error) {
//         console.error("Error in text-to-speech:", error.message);
//         res.status(500).send({ error: "Failed to generate speech" });
//     }
// });

// app.post("/image-classify", upload.single("image"), (req, res) => {
//     if (!req.file) {
//       return res.status(400).send({ error: "No image file uploaded" });
//     }
  
//     // Mock classification logic (in real use, this would involve a model inference)
//     const mockLabels = ["Cat", "Dog", "Bird"];
//     const randomLabel = mockLabels[Math.floor(Math.random() * mockLabels.length)];
  
//     res.send({ classification: randomLabel });
//   });
