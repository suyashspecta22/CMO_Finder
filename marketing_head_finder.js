const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const https = require('https');
const querystring = require('querystring');
require('dotenv').config();

// Function to make API request to SERP API
function searchMarketingHead(companyName) {
  return new Promise((resolve, reject) => {
    // SERP API key from .env file
    const apiKey = process.env.SERP_API_KEY;
    
    if (!apiKey) {
      reject("Error: SERP API key not found. Please check your .env file.");
      return;
    }
    
    // Construct the search query
    const searchQuery = `The Current Indian CMO OR marketing head of ${companyName}`;
    
    // Parameters for the API request
    const params = querystring.stringify({
      api_key: apiKey,
      engine: "google",
      q: searchQuery,
      num: 5 // Limit results to top 5
    });
    
    // SERP API endpoint with query parameters
    const url = `https://serpapi.com/search?${params}`;
    
    // Make the API request
    https.get(url, (response) => {
      let data = '';
      
      // A chunk of data has been received
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      // The whole response has been received
      response.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          
          // Check if we have organic results
          if (jsonData.organic_results && jsonData.organic_results.length > 0) {
            const results = [];
            
            for (const result of jsonData.organic_results) {
              const title = result.title || "";
              const snippet = result.snippet || "";
              
              // Extract potential names from titles and snippets
              let name = "";
              
              // Try to extract name from title
              if (title.includes(" - ")) {
                name = title.split(" - ")[0];
              } else if (title.includes(" | ")) {
                name = title.split(" | ")[0];
              } else if (title.includes(",")) {
                name = title.split(",")[0];
              }
              
              // If we couldn't extract a name from the title, try the snippet
              if (!name && snippet) {
                // Look for patterns like "Name is the CMO" or "Name, CMO"
                const nameMatch = snippet.match(/([A-Z][a-z]+ [A-Z][a-z]+)(?:\s+is|\s*,)/);
                if (nameMatch) {
                  name = nameMatch[1];
                }
              }
              
              // If we found a name, add it to results
              if (name) {
                // Check if this name is already in results
                if (!results.some(r => r.name === name)) {
                  results.push({ name });
                }
              }
            }
            
            resolve(results);
          } else {
            resolve([]);
          }
        } catch (error) {
          reject("Error parsing API response: " + error.message);
        }
      });
    }).on('error', (error) => {
      reject("Error making API request: " + error.message);
    });
  });
}

// Function to verify if a person is currently in a marketing leadership role at the company
function verifyMarketingHead(name, companyName) {
  return new Promise((resolve, reject) => {
    // SERP API key from .env file
    const apiKey = process.env.SERP_API_KEY;
    
    if (!apiKey) {
      reject("Error: SERP API key not found. Please check your .env file.");
      return;
    }
    
    // Construct the verification search query
    const searchQuery = `${name} current CMO OR "marketing head" OR "chief marketing officer" OR "marketing director" ${companyName}`;
    
    // Parameters for the API request
    const params = querystring.stringify({
      api_key: apiKey,
      engine: "google",
      q: searchQuery,
      num: 3 // Limit results to top 3
    });
    
    // SERP API endpoint with query parameters
    const url = `https://serpapi.com/search?${params}`;
    
    // Make the API request
    https.get(url, (response) => {
      let data = '';
      
      // A chunk of data has been received
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      // The whole response has been received
      response.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          
          // Check if we have organic results
          if (jsonData.organic_results && jsonData.organic_results.length > 0) {
            // Look for confirmation in snippets or titles
            let isConfirmed = false;
            let role = "";
            
            for (const result of jsonData.organic_results) {
              const snippet = result.snippet || "";
              const title = result.title || "";
              const combinedText = (snippet + " " + title).toLowerCase();
              
              // Check for current role indicators
              if ((combinedText.includes("cmo") || 
                   combinedText.includes("chief marketing officer") ||
                   combinedText.includes("marketing head") ||
                   combinedText.includes("head of marketing") ||
                   combinedText.includes("marketing director") ||
                   combinedText.includes("vp of marketing") ||
                   combinedText.includes("vice president of marketing")) && 
                  combinedText.includes(companyName.toLowerCase())) {
                
                isConfirmed = true;
                
                // Try to extract the specific role
                if (combinedText.includes("cmo") || combinedText.includes("chief marketing officer")) {
                  role = "Chief Marketing Officer (CMO)";
                } else if (combinedText.includes("marketing director")) {
                  role = "Marketing Director";
                } else if (combinedText.includes("vp of marketing") || combinedText.includes("vice president of marketing")) {
                  role = "VP of Marketing";
                } else {
                  role = "Marketing Head";
                }
                
                break;
              }
            }
            
            resolve({ isConfirmed, role });
          } else {
            resolve({ isConfirmed: false, role: "" });
          }
        } catch (error) {
          reject("Error parsing API response: " + error.message);
        }
      });
    }).on('error', (error) => {
      reject("Error making API request: " + error.message);
    });
  });
}

// Process a single company
async function processCompany(companyName) {
  console.log(`\nProcessing: ${companyName}`);
  
  try {
    console.log(`Searching for marketing head of ${companyName}...`);
    const potentialHeads = await searchMarketingHead(companyName);
    
    if (potentialHeads && potentialHeads.length > 0) {
      console.log(`Found ${potentialHeads.length} potential candidates. Verifying...`);
      
      const verifiedResults = [];
      
      // Verify each potential marketing head
      for (const person of potentialHeads) {
        console.log(`Verifying ${person.name}...`);
        const verification = await verifyMarketingHead(person.name, companyName);
        
        if (verification.isConfirmed) {
          verifiedResults.push({
            company: companyName,
            name: person.name,
            role: verification.role,
            verified: 'Yes'
          });
        } else {
          // Add unverified candidates too, but mark them as unverified
          verifiedResults.push({
            company: companyName,
            name: person.name,
            role: 'Unknown',
            verified: 'No'
          });
        }
      }
      
      return verifiedResults;
    } else {
      console.log(`No marketing head profiles found for ${companyName}.`);
      return [{
        company: companyName,
        name: 'Not Found',
        role: 'N/A',
        verified: 'N/A'
      }];
    }
  } catch (error) {
    console.error(`Error processing ${companyName}: ${error}`);
    return [{
      company: companyName,
      name: 'Error',
      role: error.toString(),
      verified: 'N/A'
    }];
  }
}

// Main function to process CSV
async function processCSV(inputFile, outputFile) {
  console.log("===== Marketing Head Finder =====");
  console.log(`Reading companies from ${inputFile}...`);
  
  const companies = [];
  
  // Read companies from CSV
  await new Promise((resolve) => {
    fs.createReadStream(inputFile)
      .pipe(csv())
      .on('data', (row) => {
        // Assuming the CSV has a column named 'company'
        if (row.company) {
          companies.push(row.company);
        }
      })
      .on('end', () => {
        resolve();
      });
  });
  
  console.log(`Found ${companies.length} companies to process.`);
  
  // Process each company
  const allResults = [];
  for (const company of companies) {
    const results = await processCompany(company);
    allResults.push(...results);
  }
  
  // Write results to CSV
  const csvWriter = createCsvWriter({
    path: outputFile,
    header: [
      {id: 'company', title: 'Company'},
      {id: 'name', title: 'Marketing Head'},
      {id: 'role', title: 'Role'},
      {id: 'verified', title: 'Verified'}
    ]
  });
  
  await csvWriter.writeRecords(allResults);
  console.log(`\nResults written to ${outputFile}`);
}

// Check command line arguments
const inputFile = process.argv[2] || 'companies.csv';
const outputFile = process.argv[3] || 'results.csv';

// Run the main function
processCSV(inputFile, outputFile).catch(console.error);