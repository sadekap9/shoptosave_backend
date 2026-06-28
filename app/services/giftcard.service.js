import { getWoohooToken } from './categories/woohooAuth.service.js';
import { placeWoohooOrder } from './woohoo/woohoo.service.js';
import logger from '../utils/logger.js';

/**
 * Build Pine Labs / Woohoo API payload using exact static layout requested
 */
export const buildWoohooPayload = ({ sku, price, qty, amount, refno }) => ({
  address: {
    firstname: "John",
    lastname: "Doe",
    email: "johndoe@example.com",
    telephone: "+918884520003",
    line1: "Koramangala",
    line2: "Bangalore",
    city: "bangalore",
    region: "Karnataka",
    country: "IN",
    postcode: "560095",
    billToThis: true
  },
  payments: [
    {
      code: "svc",
      amount: parseFloat(amount) // dynamic — total order amount
    }
  ],
  refno: refno,                 // dynamic — e.g. "ORDER_20260618_1095"
  syncOnly: true,
  deliveryMode: "API",
  products: [
    {
      sku: sku,                 // dynamic — e.g. "EGCGBNIK001"
      price: parseFloat(price), // dynamic — e.g. 1000
      qty: parseInt(qty),       // dynamic — e.g. 1
      currency: 356             // static — INR
    }
  ]
});

/**
 * Connect to Woohoo API and place order
 */
export const placeGiftCardOrder = async ({ sku, price, qty, amount, refno }) => {
    try {
        logger.info(`[GiftCard Service] Placing Woohoo order. Ref: ${refno}, SKU: ${sku}`);
        
        // 1. Fetch Auth Token
        const bearerToken = await getWoohooToken();
        
        // 2. Construct Payload
        const payload = buildWoohooPayload({ sku, price, qty, amount, refno });
        console.log('[Woohoo API Request Body]:', JSON.stringify(payload, null, 2));
        
        // 3. Post to Woohoo
        const responseData = await placeWoohooOrder(bearerToken, payload);
        console.log('[Woohoo API Response Body]:', JSON.stringify(responseData, null, 2));
        
        logger.info(`[GiftCard Service] Woohoo response status: ${responseData.status}`);
        return {
            success: true,
            data: responseData
        };
    } catch (error) {
        const errorMsg = error.response?.data?.message || error.message;
        logger.error('[GiftCard Service] Woohoo API call failed', { error: errorMsg });
        return {
            success: false,
            error: errorMsg
        };
    }
};
