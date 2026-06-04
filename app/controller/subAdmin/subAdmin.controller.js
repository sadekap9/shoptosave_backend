import * as subAdminService from '../../services/subAdmin/subAdmin.service.js';
import logger from '../../utils/logger.js';

/**
 * Add Sub-Admin
 */
export const addSubAdmin = async (req, res) => {
    try {
        const payload = req.validatedData;
        const response = await subAdminService.addSubAdminService(payload);

        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                errors: [{ message: response.message }],
                result: {}
            });
        }

        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error("AddSubAdmin Error", { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: "Internal server error" }],
            result: {}
        });
    }
};

/**
 * Update Sub-Admin
 */
export const updateSubAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.validatedData;

        if (!id) {
            return res.status(400).json({
                success: false,
                errors: [{ message: "Sub-admin ID is required" }],
                result: {}
            });
        }

        const response = await subAdminService.updateSubAdminService(id, payload);

        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                errors: [{ message: response.message }],
                result: {}
            });
        }

        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error("UpdateSubAdmin Error", { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: "Internal server error" }],
            result: {}
        });
    }
};

/**
 * Delete Sub-Admin
 */
export const deleteSubAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                errors: [{ message: "Sub-admin ID is required" }],
                result: {}
            });
        }

        const response = await subAdminService.deleteSubAdminService(id);

        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                errors: [{ message: response.message }],
                result: {}
            });
        }

        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message
            }
        });
    } catch (error) {
        logger.error("DeleteSubAdmin Error", { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: "Internal server error" }],
            result: {}
        });
    }
};

/**
 * List Sub-Admins
 */
export const listSubAdmins = async (req, res) => {
    try {
        const response = await subAdminService.listSubAdminsService();

        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                errors: [{ message: response.message }],
                result: {}
            });
        }

        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error("ListSubAdmins Error", { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: "Internal server error" }],
            result: {}
        });
    }
};
