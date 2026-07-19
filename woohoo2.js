import axios from 'axios';
import { getWoohooHeaders } from './app/helpers/woohoo.helper.js';
import dotenv from 'dotenv';

dotenv.config();

export const runWoohoo2Tests = async () => {
    const results = {};

    const WOOHOO2_USERNAME = process.env.WOOHOO2_USERNAME;
    const WOOHOO2_PASSWORD = process.env.WOOHOO2_PASSWORD;
    const WOOHOO2_CLIENT_ID = process.env.WOOHOO2_CLIENT_ID;
    const WOOHOO2_CLIENT_SECRET = process.env.WOOHOO2_CLIENT_SECRET;
    const WOOHOO2_AUTH_URL = process.env.WOOHOO2_AUTH_URL;
    const WOOHOO2_TOKEN_URL = process.env.WOOHOO2_TOKEN_URL;
    const WOOHOO2_API_BASE_URL = process.env.WOOHOO2_API_BASE_URL;

    console.log('--- Starting Woohoo2 API Credentials Test ---');
    console.log('Username:', WOOHOO2_USERNAME);
    console.log('Client ID:', WOOHOO2_CLIENT_ID);
    console.log('Auth URL:', WOOHOO2_AUTH_URL);

    // 1. Generate Authorization Code
    try {
        console.log('\n[1/8] Generating Authorization Code...');
        const authPayload = {
            clientId: WOOHOO2_CLIENT_ID,
            username: WOOHOO2_USERNAME,
            password: WOOHOO2_PASSWORD
        };
        const headers = getWoohooHeaders('POST', WOOHOO2_AUTH_URL, authPayload, null, WOOHOO2_CLIENT_SECRET);
        
        const authRes = await axios.post(WOOHOO2_AUTH_URL, authPayload, { headers, timeout: 30000 });
        console.log('Auth Code Response:', authRes.data);
        results.authCode = { success: true, data: authRes.data };
        
        const authorizationCode = authRes.data.authorizationCode;
        if (!authorizationCode) {
            throw new Error('authorizationCode not found in response');
        }

        // 2. Generate Bearer Token
        console.log('\n[2/8] Generating Bearer Token...');
        const tokenPayload = {
            clientId: WOOHOO2_CLIENT_ID,
            clientSecret: WOOHOO2_CLIENT_SECRET,
            authorizationCode
        };
        const tokenRes = await axios.post(WOOHOO2_TOKEN_URL, tokenPayload, { timeout: 30000 });
        console.log('Bearer Token Response:', tokenRes.data);
        results.bearerToken = { success: true, data: tokenRes.data };

        const bearerToken = tokenRes.data.token || tokenRes.data.access_token;
        if (!bearerToken) {
            throw new Error('bearerToken not found in response');
        }

        // 3. Fetch Category List
        console.log('\n[3/8] Fetching Categories List...');
        const categoriesUrl = `${WOOHOO2_API_BASE_URL}/v3/catalog/categories`;
        const catHeaders = getWoohooHeaders('GET', categoriesUrl, null, bearerToken, WOOHOO2_CLIENT_SECRET);
        const categoriesRes = await axios.get(categoriesUrl, { headers: catHeaders, timeout: 30000 });
        console.log(`Fetched ${categoriesRes.data?.length || 0} categories.`);
        results.categories = { success: true, data: categoriesRes.data };

        // Select a Category to test (default to 4 or first category ID if available)
        let categoryId = '4';
        if (Array.isArray(categoriesRes.data) && categoriesRes.data.length > 0) {
            categoryId = String(categoriesRes.data[0].id);
        }

        // 4. Fetch Product List for category
        console.log(`\n[4/8] Fetching Products in Category ${categoryId}...`);
        const productsUrl = `${WOOHOO2_API_BASE_URL}/v3/catalog/categories/${categoryId}/products?offset=0&limit=10`;
        const prodHeaders = getWoohooHeaders('GET', productsUrl, null, bearerToken, WOOHOO2_CLIENT_SECRET);
        const productsRes = await axios.get(productsUrl, { headers: prodHeaders, timeout: 30000 });
        console.log(`Fetched ${productsRes.data?.products?.length || 0} products.`);
        results.productsList = { success: true, data: productsRes.data };

        // Select a SKU to test (default to "CNPIN" or first SKU from products list)
        let testSku = 'CNPIN';
        if (productsRes.data?.products && productsRes.data.products.length > 0) {
            testSku = productsRes.data.products[0].sku;
        }

        // 5. Fetch Product Details
        console.log(`\n[5/8] Fetching Product Details for SKU: ${testSku}...`);
        const productUrl = `${WOOHOO2_API_BASE_URL}/v3/catalog/products/${testSku}`;
        const detailHeaders = getWoohooHeaders('GET', productUrl, null, bearerToken, WOOHOO2_CLIENT_SECRET);
        const productDetailRes = await axios.get(productUrl, { headers: detailHeaders, timeout: 30000 });
        console.log('Product Name:', productDetailRes.data?.name);
        results.productDetail = { success: true, data: productDetailRes.data };

        // 6. Place Digital Order (with syncOnly: true mock flag)
        console.log('\n[6/8] Placing Mock Order (syncOnly: true)...');
        const orderUrl = `${WOOHOO2_API_BASE_URL}/v3/order`;
        const uniqueRef = `S2S-TEST-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const orderPayload = {
            address: {
                firstname: "Shop2Save",
                lastname: "Test",
                email: "info@shoptosave.in",
                telephone: "9876543210",
                line1: "Test Address 1",
                line2: "Test Address 2",
                city: "Bangalore",
                region: "Karnataka",
                country: "IN",
                postcode: "560095",
                company: "Shop2Save Solutions",
                billToThis: true
            },
            billing: {
                firstname: "Shop2Save",
                lastname: "Billing",
                email: "info@shoptosave.in",
                telephone: "9876543210",
                line1: "Billing Address 1",
                line2: "Billing Address 2",
                city: "Bangalore",
                region: "Karnataka",
                country: "IN",
                postcode: "560095",
                company: "Shop2Save Solutions"
            },
            payments: [
                {
                    code: "svc",
                    amount: 100
                }
            ],
            refno: uniqueRef,
            syncOnly: true,
            deliveryMode: "API",
            products: [
                {
                    sku: testSku,
                    price: 100,
                    qty: 1,
                    currency: "036",
                    theme: ""
                }
            ]
        };
        const orderHeaders = getWoohooHeaders('POST', orderUrl, orderPayload, bearerToken, WOOHOO2_CLIENT_SECRET);
        const orderRes = await axios.post(orderUrl, orderPayload, { headers: orderHeaders, timeout: 60000 });
        console.log('Order Response:', orderRes.data);
        results.placeOrder = { success: true, data: orderRes.data };

        // Extract order ID/refno for status checking
        const woohooOrderId = orderRes.data.orderId || orderRes.data.id || 'test5003';

        // 7. Check Order Status
        console.log(`\n[7/8] Checking Order Status for Order ID: ${woohooOrderId}...`);
        const statusUrl = `${WOOHOO2_API_BASE_URL}/v3/order/${woohooOrderId}/status`;
        const statusHeaders = getWoohooHeaders('GET', statusUrl, null, bearerToken, WOOHOO2_CLIENT_SECRET);
        const statusRes = await axios.get(statusUrl, { headers: statusHeaders, timeout: 30000 });
        console.log('Order Status:', statusRes.data);
        results.orderStatus = { success: true, data: statusRes.data };

        // 8. Check Activated Cards
        console.log(`\n[8/8] Checking Activated Cards for Order ID: ${woohooOrderId}...`);
        const cardsUrl = `${WOOHOO2_API_BASE_URL}/v3/order/${woohooOrderId}/cards?offset=0&limit=10`;
        const cardsHeaders = getWoohooHeaders('GET', cardsUrl, null, bearerToken, WOOHOO2_CLIENT_SECRET);
        const cardsRes = await axios.get(cardsUrl, { headers: cardsHeaders, timeout: 30000 });
        console.log('Activated Cards Response:', cardsRes.data);
        results.activatedCards = { success: true, data: cardsRes.data };

        console.log('\n--- Woohoo2 API Credentials Test Passed Successfully! ---');
        results.overall = { success: true, message: 'All Woohoo2 integration API tests passed.' };

    } catch (err) {
        console.error('\n!!! Woohoo2 API Test Failed !!!');
        console.error('Error Message:', err.message);
        if (err.response) {
            console.error('HTTP Status:', err.response.status);
            console.error('Response Data:', JSON.stringify(err.response.data, null, 2));
            results.errorDetails = { status: err.response.status, data: err.response.data };
        }
        results.overall = { success: false, error: err.message };
    }

    return results;
};

// Run directly if executed from CLI
if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
    runWoohoo2Tests()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
