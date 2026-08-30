import axios from 'axios';
import dotenv from 'dotenv';
import { getWoohooHeaders } from '../helpers/woohoo.helper.js';

dotenv.config();

async function testAuth() {
    const {
        WOOHOO_AUTH_URL,
        WOOHOO_CLIENT_ID,
        WOOHOO_CLIENT_SECRET,
        WOOHOO_USERNAME,
        WOOHOO_PASSWORD
    } = process.env;

    console.log('Using credentials:');
    console.log('Username:', WOOHOO_USERNAME);
    console.log('Auth URL:', WOOHOO_AUTH_URL);

    const authPayload = {
        clientId: WOOHOO_CLIENT_ID,
        username: WOOHOO_USERNAME,
        password: WOOHOO_PASSWORD
    };

    const baseHeaders = getWoohooHeaders('POST', WOOHOO_AUTH_URL, authPayload, null, WOOHOO_CLIENT_SECRET);
    
    const headers = {
        ...baseHeaders,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    try {
        console.log('Sending request to verify auth...');
        const res = await axios.post(WOOHOO_AUTH_URL, authPayload, { headers, timeout: 30000 });
        console.log('Success! Response:', res.data);
    } catch (err) {
        console.error('Failed with error:', err.message);
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Body:', err.response.data);
        }
    }
}

testAuth();
