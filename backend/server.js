import app from "./app.js";
import cloudinary from "cloudinary";

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLIENT_NAME,
  api_key: process.env.CLOUDINARY_CLIENT_API,
  api_secret: process.env.CLOUDINARY_CLIENT_SECRET,
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running at port ${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use.`);
    console.log(`\n💡 To fix this, run one of these commands:`);
    console.log(`   - npm run dev:clean (kills port ${PORT} and starts server)`);
    console.log(`   - lsof -ti:${PORT} | xargs kill -9 (manual kill)`);
    console.log(`   - Or change PORT in your .env file\n`);
    process.exit(1);
  } else {
    throw err;
  }
});
