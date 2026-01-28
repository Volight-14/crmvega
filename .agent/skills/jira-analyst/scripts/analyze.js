const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const JIRA_HOST = process.env.JIRA_HOST;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

if (!JIRA_HOST || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    // Try loading from frontend/.env
    const frontendEnvPath = path.join(process.cwd(), 'frontend', '.env');
    if (fs.existsSync(frontendEnvPath)) {
        require('dotenv').config({ path: frontendEnvPath });
    }
}

// Re-check after fallback
if (!process.env.JIRA_HOST || !process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN) {
    console.error('Error: Missing Jira credentials in .env file (checked root and frontend/.env).');
    console.error('Please ensure JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN are set.');
    process.exit(1);
}

// Update constants from potentially new env source
const finalHost = process.env.JIRA_HOST;
const finalEmail = process.env.JIRA_EMAIL;
const finalToken = process.env.JIRA_API_TOKEN;

// Clean host URL
const cleanHost = finalHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
const baseURL = `https://${cleanHost}/rest/api/3`;

const authHeader = {
    'Authorization': `Basic ${Buffer.from(`${finalEmail}:${finalToken}`).toString('base64')}`,
    'Accept': 'application/json'
};

async function downloadFile(url, outputPath) {
    const writer = fs.createWriteStream(outputPath);

    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: authHeader
        }, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download file: ${response.statusCode}`));
                return;
            }
            response.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', reject);
        }).on('error', reject);
    });
}

function parseJiraDoc(content) {
    if (!content) return '';
    // Simple parser for Jira "fancier" document format if needed, 
    // but usually we just want the text representation or handle 'content' arrays.
    // For now, let's assume valid handling or basic JSON dump if complex.
    // Atlassian Document Format is complex, extracting text recursively:

    if (typeof content === 'string') return content;

    if (content.type === 'text') return content.text;

    if (content.content && Array.isArray(content.content)) {
        return content.content.map(parseJiraDoc).join(content.type === 'paragraph' ? '\n\n' : '');
    }

    return '';
}

async function analyzeTask(issueKeyOrUrl) {
    // Extract Issue Key
    let issueKey = issueKeyOrUrl;
    if (issueKeyOrUrl.includes('/browse/')) {
        const parts = issueKeyOrUrl.split('/browse/');
        issueKey = parts[1].split('?')[0].split('/')[0];
    }

    console.log(`Analyzing Issue: ${issueKey}...`);

    try {
        // 1. Fetch Issue Details
        const issueRes = await axios.get(`${baseURL}/issue/${issueKey}`, { headers: authHeader });
        const issue = issueRes.data;

        const summary = issue.fields.summary;
        // Description can be null or Atlassian Document format
        let description = "No description provided.";
        if (issue.fields.description) {
            description = typeof issue.fields.description === 'string'
                ? issue.fields.description
                : JSON.stringify(issue.fields.description, null, 2); // Keep raw for now or improve parser
        }

        const status = issue.fields.status.name;
        const priority = issue.fields.priority ? issue.fields.priority.name : 'None';
        const reporter = issue.fields.reporter ? issue.fields.reporter.displayName : 'Unknown';

        // 2. Fetch Comments (Rendered)
        // Using 'expand=renderedFields' to get HTML/Markdown-like representation if possible, 
        // but API v3 often returns ADF (Atlassian Document Format).

        // Let's rely on standard fields first.
        const comments = issue.fields.comment.comments || [];

        // 3. Handle Attachments
        const attachments = issue.fields.attachment || [];

        // Prepare Output Directory
        const outputDir = path.join(process.cwd(), '.agent', 'temp', 'jira', issueKey);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Download Images
        const downloadedFiles = [];
        for (const attachment of attachments) {
            if (attachment.mimeType.startsWith('image/')) {
                const fileName = attachment.filename;
                const filePath = path.join(outputDir, fileName);
                console.log(`Downloading attachment: ${fileName}...`);
                try {
                    await downloadFile(attachment.content, filePath);
                    downloadedFiles.push(fileName);
                } catch (e) {
                    console.error(`Failed to download ${fileName}: ${e.message}`);
                }
            }
        }

        // Generate Report
        let report = `# Jira Task: ${issueKey}\n\n`;
        report += `**Summary**: ${summary}\n`;
        report += `**Status**: ${status} | **Priority**: ${priority} | **Reporter**: ${reporter}\n\n`;

        report += `## Description\n\n`;
        report += `${description}\n\n`;

        report += `## Attachments\n`;
        if (downloadedFiles.length > 0) {
            downloadedFiles.forEach(f => {
                report += `- [${f}](./${f}) (Downloaded)\n`;
            });
        } else {
            report += `No image attachments found.\n`;
        }

        report += `\n## Comments History\n\n`;
        if (comments.length > 0) {
            comments.forEach(c => {
                const author = c.author.displayName;
                const created = new Date(c.created).toLocaleString();
                const body = typeof c.body === 'string' ? c.body : JSON.stringify(c.body, null, 2);
                report += `### ${author} (${created})\n${body}\n\n---\n`;
            });
        } else {
            report += `No comments.\n`;
        }

        const reportPath = path.join(outputDir, 'SUMMARY.md');
        fs.writeFileSync(reportPath, report);

        console.log(`\nAnalysis Complete!`);
        console.log(`Summary saved to: ${reportPath}`);
        console.log(`Attachments saved to: ${outputDir}`);

    } catch (error) {
        console.error('Error fetching Jira issue:');
        if (error.response) {
            console.error(`${error.response.status} - ${error.response.statusText}`);
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

const arg = process.argv[2];
if (!arg) {
    console.log("Usage: node analyze.js <ISSUE_KEY_OR_URL>");
} else {
    analyzeTask(arg);
}
