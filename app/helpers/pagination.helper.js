export const sanitizePaginationParams = (page, limit, defaultLimit = 10) => {
    const sanitizedPage = Math.max(1, parseInt(page) || 1);
    const sanitizedLimit = Math.max(1, parseInt(limit) || defaultLimit);
    return {
        page: sanitizedPage,
        limit: sanitizedLimit,
        offset: (sanitizedPage - 1) * sanitizedLimit
    };
};

export const buildPagination = (total, page, limit) => {
    const totalPages = Math.ceil(total / limit) || 1;
    return {
        current_page: parseInt(page),
        total_pages: totalPages,
        has_next_page: page < totalPages,
        per_page: parseInt(limit),
        total_records: total
    };
};
