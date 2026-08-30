import { validateOrderQuantityAndSync } from '../middlewares/orderValidation.middleware.js';
import assert from 'assert';

console.log('Running Order Validation Middleware tests...');

const mockResponse = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.jsonData = data;
        return res;
    };
    return res;
};

const runTest = (name, body, expectedFail, expectedJson = null) => {
    const req = { body };
    const res = mockResponse();
    let nextCalled = false;
    const next = () => {
        nextCalled = true;
    };

    validateOrderQuantityAndSync(req, res, next);

    if (expectedFail) {
        assert.strictEqual(nextCalled, false, `${name}: expected middleware to block request (next() should not be called)`);
        assert.strictEqual(res.statusCode, 400, `${name}: expected HTTP status 400, got ${res.statusCode}`);
        assert.deepStrictEqual(res.jsonData, expectedJson, `${name}: expected specific JSON payload, got ${JSON.stringify(res.jsonData)}`);
    } else {
        assert.strictEqual(nextCalled, true, `${name}: expected request to pass (next() should be called)`);
        assert.strictEqual(res.statusCode, undefined, `${name}: expected no response to be sent`);
    }
    console.log(`[PASS] ${name}`);
};

const expectedErrorPayload = {
    code: 5321,
    message: "Order cannot be processed",
    errors: [],
    result: {
        additionalTxnFields: {}
    }
};

try {
    // 1. quantity = 6, sync_only = true -> MUST FAIL
    runTest('Test 1: qty=6, sync_only=true (Root fields)', {
        qty: 6,
        sync_only: true
    }, true, expectedErrorPayload);

    // 2. quantity = 10, sync_only = true -> MUST FAIL
    runTest('Test 2: quantity=10, syncOnly=true (Alternate spelling)', {
        quantity: 10,
        syncOnly: true
    }, true, expectedErrorPayload);

    // 3. quantity = 5, sync_only = true -> MUST PASS
    runTest('Test 3: qty=5, sync_only=true', {
        qty: 5,
        sync_only: true
    }, false);

    // 4. quantity = 6, sync_only = false -> MUST PASS
    runTest('Test 4: qty=6, sync_only=false', {
        qty: 6,
        sync_only: false
    }, false);

    // 5. quantity = 1, sync_only = true -> MUST PASS
    runTest('Test 5: qty=1, sync_only=true', {
        qty: 1,
        sync_only: true
    }, false);

    // 6. Test with products array: one product has qty=6, sync_only=true -> MUST FAIL
    runTest('Test 6: products array with one qty=6, sync_only=true', {
        products: [
            { sku: 'TEST1', qty: 2 },
            { sku: 'TEST1', qty: 6 }
        ],
        sync_only: true
    }, true, expectedErrorPayload);

    // 7. Test with products array: sum of quantities = 6, sync_only=true -> MUST FAIL
    runTest('Test 7: products array sum qty=6, sync_only=true', {
        products: [
            { sku: 'TEST1', qty: 3 },
            { sku: 'TEST1', qty: 3 }
        ],
        sync_only: true
    }, true, expectedErrorPayload);

    // 8. Test with products array: sum of quantities = 5, sync_only=true -> MUST PASS
    runTest('Test 8: products array sum qty=5, sync_only=true', {
        products: [
            { sku: 'TEST1', qty: 2 },
            { sku: 'TEST1', qty: 3 }
        ],
        sync_only: true
    }, false);

    // 9. Test Case #27: Multiple different SKUs -> MUST FAIL (Decoding error)
    runTest('Test 9: multiple different SKUs (CNPIN, CLAIMCODE)', {
        products: [
            { sku: 'CNPIN', qty: 1 },
            { sku: 'CLAIMCODE', qty: 1 }
        ],
        sync_only: false
    }, true, {
        code: 400,
        message: "Decoding error"
    });

    // 10. Test Case #27: Multiple identical SKUs -> MUST PASS
    runTest('Test 10: multiple identical SKUs', {
        products: [
            { sku: 'CNPIN', qty: 1 },
            { sku: 'CNPIN', qty: 1 }
        ],
        sync_only: false
    }, false);

    console.log('\nAll order validation middleware tests passed successfully!');
} catch (err) {
    console.error('\nTest suite failed!');
    console.error(err);
    process.exit(1);
}
