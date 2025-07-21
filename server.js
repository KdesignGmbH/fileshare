const express = require('express');
const multer = require('multer');
const https = require('https');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const { execSync } = require('child_process');

const app = express();
const PORT = 3443;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Generate self-signed certificate if it doesn't exist
const keyPath = path.join(__dirname, 'server.key');
const certPath = path.join(__dirname, 'server.cert');

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.log('Generating self-signed SSL certificate...');
    try {
        execSync(`openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.cert -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"`, {
            stdio: 'inherit'
        });
        console.log('SSL certificate generated successfully');
    } catch (error) {
        console.error('Error generating SSL certificate. Please install OpenSSL or generate certificates manually.');
        process.exit(1);
    }
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        cb(null, `${timestamp}-${file.originalname}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Session configuration
app.use(session({
    secret: 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: true, maxAge: 3600000 } // 1 hour
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files
app.use('/uploads', express.static(uploadsDir));

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session.authenticated) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Main upload page
app.get('/', (req, res) => {
    const html_main = fs.readFileSync('./static/main.html', 'utf-8');
    res.send(html_main);
});

// Login page
app.get('/login', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Secure File Upload</title>
    <style>
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    }

    .container {
        background: rgba(255, 255, 255, 0.95);
        padding: 40px;
        border-radius: 20px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        backdrop-filter: blur(10px);
        max-width: 400px;
        width: 100%;
        text-align: center;
    }

    h1 {
        color: #333;
        margin-bottom: 30px;
        font-size: 2rem;
        font-weight: 300;
    }

    .form-group {
        margin-bottom: 20px;
        text-align: left;
    }

    label {
        display: block;
        margin-bottom: 5px;
        color: #555;
        font-weight: 500;
    }

    input[type="password"] {
        width: 100%;
        padding: 15px;
        border: 2px solid #e0e0e0;
        border-radius: 10px;
        font-size: 1rem;
        transition: border-color 0.3s ease;
    }

    input[type="password"]:focus {
        outline: none;
        border-color: #667eea;
    }

    .btn {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 15px 30px;
        border-radius: 25px;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.3s ease;
        width: 100%;
    }

    .btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
    }

    .error {
        color: #721c24;
        background: #f8d7da;
        padding: 10px;
        border-radius: 5px;
        margin-bottom: 20px;
        border: 1px solid #f5c6cb;
    }

    .nav-link {
        position: absolute;
        top: 20px;
        left: 20px;
        color: white;
        text-decoration: none;
        background: rgba(255, 255, 255, 0.2);
        padding: 10px 20px;
        border-radius: 20px;
        backdrop-filter: blur(10px);
        transition: all 0.3s ease;
    }

    .nav-link:hover {
        background: rgba(255, 255, 255, 0.3);
    }
    </style>
    </head>
    <body>
    <a href="/" class="nav-link">← Back to Upload</a>

    <div class="container">
    <h1>🔐 Login</h1>

    ${req.query.error ? '<div class="error">Invalid password. Please try again.</div>' : ''}

    <form method="POST" action="/login">
    <div class="form-group">
    <label for="password">Password:</label>
    <input type="password" id="password" name="password" required>
    </div>

    <button type="submit" class="btn">Login</button>
    </form>
    </div>
    </body>
    </html>
    `);
});

// Handle login
app.post('/login', (req, res) => {
    const { password } = req.body;
    // Change this password to something secure
    if (password === 'admin123') {
        req.session.authenticated = true;
        res.redirect('/view');
    } else {
        res.redirect('/login?error=1');
    }
});

// View files page (protected)
app.get('/view', requireAuth, (req, res) => {
    const files = fs.readdirSync(uploadsDir).map(filename => {
        const filepath = path.join(uploadsDir, filename);
        const stats = fs.statSync(filepath);
        return {
            name: filename,
            originalName: filename.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/, ''),
                                                 size: stats.size,
                                                 uploadDate: stats.ctime
        };
    });

    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>File Manager - Secure File Upload</title>
    <style>
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        padding: 20px;
    }

    .container {
        background: rgba(255, 255, 255, 0.95);
        padding: 30px;
        border-radius: 20px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        backdrop-filter: blur(10px);
        max-width: 1200px;
        margin: 0 auto;
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 30px;
        flex-wrap: wrap;
        gap: 20px;
    }

    h1 {
        color: #333;
        font-size: 2rem;
        font-weight: 300;
    }

    .controls {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
    }

    .btn {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 20px;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.3s ease;
        text-decoration: none;
        display: inline-block;
    }

    .btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3);
    }

    .btn-danger {
        background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
    }

    .btn-danger:hover {
        box-shadow: 0 8px 16px rgba(231, 76, 60, 0.3);
    }

    .sort-controls {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
        flex-wrap: wrap;
    }

    select {
        padding: 8px 15px;
        border: 2px solid #e0e0e0;
        border-radius: 15px;
        font-size: 0.9rem;
        background: white;
    }

    .file-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 20px;
    }

    .file-card {
        background: white;
        border-radius: 15px;
        padding: 20px;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
        transition: all 0.3s ease;
        border: 1px solid #f0f0f0;
    }

    .file-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 15px 30px rgba(0, 0, 0, 0.15);
    }

    .file-info {
        margin-bottom: 15px;
    }

    .file-name {
        font-weight: 600;
        color: #333;
        margin-bottom: 5px;
        word-break: break-word;
    }

    .file-meta {
        color: #666;
        font-size: 0.85rem;
        display: flex;
        justify-content: space-between;
        margin-bottom: 5px;
    }

    .file-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
    }

    .btn-small {
        padding: 6px 12px;
        font-size: 0.8rem;
        border-radius: 15px;
        flex: 1;
        min-width: 80px;
        text-align: center;
    }

    .empty-state {
        text-align: center;
        padding: 60px 20px;
        color: #666;
    }

    .empty-icon {
        font-size: 4rem;
        margin-bottom: 20px;
    }

    @media (max-width: 768px) {
        .header {
            flex-direction: column;
            align-items: flex-start;
        }

        .controls {
            width: 100%;
            justify-content: flex-start;
        }

        .file-grid {
            grid-template-columns: 1fr;
        }
    }
    </style>
    </head>
    <body>
    <div class="container">
    <div class="header">
    <h1>📁 File Manager</h1>
    <div class="controls">
    <a href="/" class="btn">Upload New Files</a>
    <a href="/logout" class="btn">Logout</a>
    </div>
    </div>

    <div class="sort-controls">
    <select id="sortBy" onchange="sortFiles()">
    <option value="date">Sort by Upload Date</option>
    <option value="name">Sort by File Name</option>
    <option value="size">Sort by File Size</option>
    </select>
    <select id="sortOrder" onchange="sortFiles()">
    <option value="desc">Descending</option>
    <option value="asc">Ascending</option>
    </select>
    </div>

    <div class="file-grid" id="fileGrid">
    ${files.length === 0 ?
        '<div class="empty-state"><div class="empty-icon">📂</div><h3>No files uploaded yet</h3><p>Upload some files to get started!</p></div>' :
        files.map(file => `
        <div class="file-card" data-name="${file.originalName}" data-date="${file.uploadDate.getTime()}" data-size="${file.size}">
        <div class="file-info">
        <div class="file-name">${file.originalName}</div>
        <div class="file-meta">
        <span>📅 ${file.uploadDate.toLocaleDateString()}</span>
        <span>📏 ${(file.size / 1024 / 1024).toFixed(2)} MB</span>
        </div>
        <div class="file-meta">
        <span>🕒 ${file.uploadDate.toLocaleTimeString()}</span>
        </div>
        </div>
        <div class="file-actions">
        <a href="/download/${encodeURIComponent(file.name)}" class="btn btn-small">Download</a>
        <button onclick="deleteFile('${file.name}')" class="btn btn-danger btn-small">Delete</button>
        </div>
        </div>
        `).join('')
    }
    </div>
    </div>

    <script>
    let filesData = ${JSON.stringify(files)};

    function sortFiles() {
        const sortBy = document.getElementById('sortBy').value;
        const sortOrder = document.getElementById('sortOrder').value;
        const fileGrid = document.getElementById('fileGrid');
        const fileCards = Array.from(fileGrid.querySelectorAll('.file-card'));

        fileCards.sort((a, b) => {
            let aValue, bValue;

            switch(sortBy) {
                case 'name':
                    aValue = a.dataset.name.toLowerCase();
                    bValue = b.dataset.name.toLowerCase();
                    break;
                case 'date':
                    aValue = parseInt(a.dataset.date);
                    bValue = parseInt(b.dataset.date);
                    break;
                case 'size':
                    aValue = parseInt(a.dataset.size);
                    bValue = parseInt(b.dataset.size);
                    break;
            }

            if (sortOrder === 'asc') {
                return aValue > bValue ? 1 : -1;
            } else {
                return aValue < bValue ? 1 : -1;
            }
        });

        // Clear and re-append sorted cards
        fileGrid.innerHTML = '';
        fileCards.forEach(card => fileGrid.appendChild(card));
    }

    function deleteFile(filename) {
        if (confirm('Are you sure you want to delete this file? This action cannot be undone.')) {
            fetch(\`/delete/\${encodeURIComponent(filename)}\`, {
                method: 'DELETE'
            })
            .then(response => {
                if (response.ok) {
                    location.reload();
                } else {
                    alert('Failed to delete file. Please try again.');
                }
            })
            .catch(error => {
                alert('Failed to delete file. Please try again.');
            });
        }
    }

    // Initialize with default sort
    sortFiles();
    </script>
    </body>
    </html>
    `);
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// File upload endpoint
app.post('/upload', upload.array('files'), (req, res) => {
    res.json({ success: true, message: 'Files uploaded successfully' });
});

// Download file
app.get('/download/:filename', requireAuth, (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(uploadsDir, filename);

    if (fs.existsSync(filepath)) {
        const originalName = filename.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/, '');
        res.download(filepath, originalName);
    } else {
        res.status(404).send('File not found');
    }
});

// Delete file
app.delete('/delete/:filename', requireAuth, (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(uploadsDir, filename);

    if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Create HTTPS server
const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
};

const server = https.createServer(httpsOptions, app);

server.listen(PORT, () => {
    console.log(`🚀 Secure file upload server running on https://localhost:${PORT}`);
    console.log(`📁 Upload files at: https://localhost:${PORT}`);
    console.log(`🔐 View files at: https://localhost:${PORT}/view (password: admin123)`);
    console.log(`⚠️  Note: You'll see a security warning due to self-signed certificate - click "Advanced" and "Proceed to localhost"`);
});
