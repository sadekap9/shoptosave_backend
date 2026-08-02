import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000/api/v1';

async function runTests() {
    console.log('--- STARTING DISPUTES API TEST ---\n');

    // 1. Log in as Admin
    console.log('[1/5] Logging in as Admin...');
    const adminLoginRes = await fetch(`${BASE_URL}/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'admin@shoptosave.in', // Update with a valid email in database
            password: 'securepassword'    // Update with a valid password
        })
    });

    const adminData = await adminLoginRes.json();
    if (!adminData.success) {
        console.error('Admin Login Failed:', adminData.errors);
        return;
    }
    const adminToken = adminData.result.data.accessToken;
    console.log('Admin Authenticated successfully.\n');

    // 2. Fetch disputes list (Admin view with pagination)
    console.log('[2/5] Fetching disputes (Admin View, Page: 1, Limit: 2)...');
    const getDisputesRes = await fetch(`${BASE_URL}/disputes?page=1&limit=2`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const disputesList = await getDisputesRes.json();
    console.log('API Response:', JSON.stringify(disputesList.result, null, 2), '\n');

    if (disputesList.result.data && disputesList.result.data.length > 0) {
        const testDisputeId = disputesList.result.data[0].id;

        // 3. Get single dispute details
        console.log(`[3/5] Fetching Dispute details for ID: ${testDisputeId}...`);
        const getDetailsRes = await fetch(`${BASE_URL}/disputes/${testDisputeId}`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const detailsData = await getDetailsRes.json();
        console.log('Details:', JSON.stringify(detailsData.result, null, 2), '\n');

        // 4. Update dispute status
        console.log(`[4/5] Updating status of dispute #${testDisputeId} to In Progress (status = 2)...`);
        const updateStatusRes = await fetch(`${BASE_URL}/disputes/${testDisputeId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 2 })
        });
        const statusData = await updateStatusRes.json();
        console.log('Update Result:', JSON.stringify(statusData.result, null, 2), '\n');
    } else {
        console.log('No disputes found in database to test detail fetching and status updates.\n');
    }

    console.log('--- E2E DISPUTES TESTING COMPLETE ---');
}

runTests().catch(console.error);
