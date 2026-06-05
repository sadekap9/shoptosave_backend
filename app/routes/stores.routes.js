import express from 'express';
import {
    getStores,
    createStore,
    updateStore,
    deleteStore
} from '../controller/stores.controller.js';
import authenticate, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import upload from '../middlewares/upload.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createStoreSchema, updateStoreSchema } from '../validations/store.validation.js';

const router = express.Router();

// List all stores (Authorized for Role 1 and 2)
router.get('/list', authenticate, authorizeRole([1, 2]), getStores);

// Create new store (Authorized for Role 1 and 2)
router.post('/add', 
    authenticate, 
    authorizeRole([1, 2]), 
    upload.single('logo'), 
    validate(createStoreSchema), 
    createStore
);

// Update store (Authorized for Role 1 and 2)
router.patch('/update/:id', 
    authenticate, 
    authorizeRole([1, 2]), 
    upload.single('logo'), 
    validate(updateStoreSchema), 
    updateStore
);

// Delete store (Authorized for Role 1 and 2)
router.delete('/delete/:id', 
    authenticate, 
    authorizeRole([1, 2]), 
    deleteStore
);

export default router;
