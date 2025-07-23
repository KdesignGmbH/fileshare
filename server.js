const express = require('express');
const multer = require('multer');
const https = require('https');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const { execSync } = require('child_process');
const ejs = require('ejs');

const { PORT } = require('./config');
const { PATH_UPLOAD, PATH_STATIC } = require('./config');
const { SECRET_VIEW_FILES_PASSWORD } = require('./config');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, PATH_STATIC));


// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, PATH_UPLOAD);
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
app.use('/' + PATH_UPLOAD, express.static(uploadsDir));

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
    const html_main = fs.readFileSync(`./${PATH_STATIC}/main.html`, 'utf-8');
    res.send(html_main);
});

// css style
app.get('/styles.css', (req, res) => {
    const css = fs.readFileSync(`./${PATH_STATIC}/styles.css`);
    res.set('Content-Type', 'text/css');
    res.send(css);
});

// Login page
app.get('/login', (req, res) => {
    const error_element = req.query.error
        ? '<div class="error">Invalid password. Please try again.</div>'
        : '';

    res.render('login', {error: error_element});
});

// Handle login
app.post('/login', (req, res) => {
    const { password } = req.body;
    // Change this password to something secure
    if (password === SECRET_VIEW_FILES_PASSWORD) {
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

    res.render("view_files", {files: files});
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
    console.log(`🔐 View files at: https://localhost:${PORT}/view (password: ${SECRET_VIEW_FILES_PASSWORD})`);
    console.log(`⚠️  Note: You'll see a security warning due to self-signed certificate - click "Advanced" and "Proceed to localhost"`);
});
