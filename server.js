const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Serve static compiled UI from the public directory
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log(`Neon Sign Creator local node server is running!`);
    console.log(`Access your builder natively at http://localhost:${PORT}`);
});
