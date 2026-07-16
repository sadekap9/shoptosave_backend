import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { imageLimits, uploadFolders } from '../config/constant/constant.js';

// Ensure uploads directories exist
[uploadFolders.MOBILE, uploadFolders.DESKTOP, 'uploads/giftcards'].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'mobile_images') {
            cb(null, uploadFolders.MOBILE);
        } else if (file.fieldname === 'desktop_images') {
            cb(null, uploadFolders.DESKTOP);
        } else if (file.fieldname === 'giftcard_image') {
            cb(null, 'uploads/giftcards');
        } else {
            cb(new Error(`Invalid fieldname: ${file.fieldname}`), null);
        }
    },
    filename: (req, file, cb) => {
        // Generate a unique file name
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// File filter validation
const fileFilter = (req, file, cb) => {
    const extName = imageLimits.ALLOWED_EXTENSIONS.test(path.extname(file.originalname).toLowerCase());
    const mimeType = imageLimits.ALLOWED_MIME_TYPES.includes(file.mimetype);

    if (extName && mimeType) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files (jpeg, jpg, png, webp) are allowed!'));
    }
};

// Multer upload configurations
const upload = multer({
    storage: storage,
    limits: { fileSize: imageLimits.MAX_FILE_SIZE },
    fileFilter: fileFilter
});

// Field-based uploads middleware supporting multiple file fields
export const giftCardUploadFields = upload.fields([
    { name: 'mobile_images', maxCount: imageLimits.MAX_COUNT },
    { name: 'desktop_images', maxCount: imageLimits.MAX_COUNT },
    { name: 'giftcard_image', maxCount: 1 }
]);
