const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { verifyEvent, getEventHash, finalizeEvent, SimplePool } = require('nostr-tools');
const WebSocket = require('ws');

// Cargar variables de entorno
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3004;

// Almacenamiento temporal para zaps pendientes
const pendingZaps = new Map();

// Pool de relays para Nostr
const relays = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band',
    'wss://nostr.wine',
    'wss://relay.primal.net',
    'wss://purplepag.es',
    'wss://offchain.pub',
    'wss://bitcoiner.social'
];

// Obtener la clave pública de Nostr desde las variables de entorno
const serverPrivKey = process.env.TUNOMBRE_PRIVATE_KEY;
if (!serverPrivKey) {
    console.error('FATAL ERROR: TUNOMBRE_PRIVATE_KEY is not set in environment variables.');
    process.exit(1);
}
const serverPubKey = require('nostr-tools').getPublicKey(serverPrivKey);

app.use(cors());
app.use(express.json());

// Endpoint LNURL-pay metadata
app.get('/.well-known/lnurlp/tuweb', (req, res) => {
    res.json({
        callback: `https://tuweb.com/lnurl-pay/callback`,
        maxSendable: 100000000, // 100,000 sats = 100,000,000 millisats
        minSendable: 1000,      // 1 sat = 1,000 millisats
        metadata: JSON.stringify([
            ["text/identifier", `tunombre@tuweb.com`],
            ["text/plain", "Pay to tunombre Lightning Address"],
            ["image/png;base64", "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="] // Placeholder
        ]),
        tag: "payRequest",
        commentAllowed: 100,
        allowsNostr: true,
        nostrPubkey: serverPubKey // El campo clave para los Zaps
    });
});

// Función para validar evento de zap
function validateZapEvent(zapEvent) {
    try {
        if (!zapEvent.pubkey || !zapEvent.kind || !zapEvent.created_at || !zapEvent.tags) {
            return { valid: false, reason: 'Incomplete zap event' };
        }
        if (!verifyEvent(zapEvent)) {
            return { valid: false, reason: 'Invalid signature' };
        }
        if (zapEvent.kind !== 9734) {
            return { valid: false, reason: 'Not a zap request event' };
        }
        
        const pTag = zapEvent.tags.find(tag => tag[0] === 'p');
        if (!pTag) {
            return { valid: false, reason: 'Missing p tag' };
        }

        const eTag = zapEvent.tags.find(tag => tag[0] === 'e');
        const relaysTag = zapEvent.tags.find(tag => tag[0] === 'relays');
        const amountTag = zapEvent.tags.find(tag => tag[0] === 'amount');

        return {
            valid: true,
            recipientPubkey: pTag[1],
            eventId: eTag ? eTag[1] : null,
            relays: relaysTag ? relaysTag.slice(1) : [],
            amount: amountTag ? parseInt(amountTag[1]) : null
        };
    } catch (error) {
        return { valid: false, reason: error.message };
    }
}

// Endpoint callback para generar invoices
app.get('/lnurl-pay/callback', async (req, res) => {
    try {
        const { amount, comment, nostr } = req.query;
        const amountMsat = parseInt(amount);

        let zapEvent = null;
        let zapValidation = null;

        if (nostr) {
            try {
                zapEvent = JSON.parse(decodeURIComponent(nostr));
                zapValidation = validateZapEvent(zapEvent);
                if (!zapValidation.valid) {
                    return res.status(400).json({
                        status: 'ERROR',
                        reason: `Invalid zap event: ${zapValidation.reason}`
                    });
                }
            } catch (error) {
                return res.status(400).json({
                    status: 'ERROR',
                    reason: 'Invalid nostr parameter'
                });
            }
        }

        if (!amount || amountMsat < 1000 || amountMsat > 100000000) {
            return res.status(400).json({
                status: 'ERROR',
                reason: 'Amount outside range: 1-100000 sats'
            });
        }

        const { SocksProxyAgent } = require('socks-proxy-agent');
        let axiosConfig = {};
        if (process.env.LNBITS_API_URL && process.env.LNBITS_API_URL.includes('.onion')) {
            const proxyAgent = new SocksProxyAgent(process.env.TOR_PROXY_URL.replace('socks5://', 'socks5h://'));
            axiosConfig.httpAgent = proxyAgent;
            axiosConfig.httpsAgent = proxyAgent;
            axiosConfig.proxy = false;
            axiosConfig.timeout = 60000;
        }

        let memo = 'tunombre@tuweb.com';
        if (zapEvent) {
            memo = `Zap from ${zapEvent.pubkey.substring(0, 8)}...`;
        } else if (comment) {
            memo = `Lightning Address: ${comment}`;
        }

        const lnbitsResponse = await axios.post(
            `${process.env.LNBITS_API_URL}/api/v1/payments`,
            {
                out: false,
                amount: Math.floor(amountMsat / 1000),
                memo: memo,
                expiry: 600,
            },
            {
                headers: {
                    'X-Api-Key': process.env.LNBITS_INVOICE_KEY,
                    'Content-Type': 'application/json'
                },
                ...axiosConfig
            }
        );

        const paymentHash = lnbitsResponse.data.payment_hash;
        
        if (zapEvent) {
            pendingZaps.set(paymentHash, {
                zapEvent: zapEvent,
                zapValidation: zapValidation,
                amount: amountMsat,
                timestamp: Date.now(),
                bolt11: lnbitsResponse.data.bolt11
            });
        }

        res.json({
            pr: lnbitsResponse.data.bolt11,
            routes: []
        });

    } catch (error) {
        console.error('Lightning Address error:', error.message);
        res.status(500).json({
            status: 'ERROR',
            reason: 'Failed to create invoice'
        });
    }
});

// Función para crear y publicar zap receipt
async function processZapPayment(paymentHash, paymentData) {
    const zapInfo = pendingZaps.get(paymentHash);
    if (!zapInfo) return;

    let recipientPubkey = zapInfo.zapValidation.recipientPubkey;
    if (!recipientPubkey) {
        recipientPubkey = serverPubKey;
    }
    
    // Crear zap receipt (NIP-57)
    const zapReceipt = {
        kind: 9735,
        created_at: Math.floor(Date.now() / 1000),
        content: '',
        tags: [
            ['bolt11', zapInfo.bolt11 || ''],
            ['description', JSON.stringify(zapInfo.zapEvent)],
            ['preimage', paymentData.preimage || ''],
            ['p', recipientPubkey]
        ],
        pubkey: serverPubKey
    };

    if (zapInfo.zapValidation.eventId) {
        zapReceipt.tags.push(['e', zapInfo.zapValidation.eventId]);
    }
    
    const signedZapReceipt = finalizeEvent(zapReceipt, serverPrivKey);

    if (!verifyEvent(signedZapReceipt)) {
        console.error('❌ Invalid zap receipt signature! Not publishing.');
        return;
    }
    
    const relaysToUse = zapInfo.zapValidation.relays.length > 0 
        ? zapInfo.zapValidation.relays 
        : relays;
        
    for (const relay of relaysToUse) {
        const ws = new WebSocket(relay);
        ws.on('open', () => {
            const eventMessage = JSON.stringify(['EVENT', signedZapReceipt]);
            ws.send(eventMessage);
            console.log(`✅ Published zap receipt to ${relay}`);
            ws.close();
        });
        ws.on('error', (error) => {
            console.error(`❌ Error with ${relay}: ${error.message}`);
        });
    }

    pendingZaps.delete(paymentHash);
}

// Función para verificar pagos pendientes
async function checkPendingPayments() {
    if (pendingZaps.size === 0) return;
    
    const { SocksProxyAgent } = require('socks-proxy-agent');
    let axiosConfig = {};
    if (process.env.LNBITS_API_URL && process.env.LNBITS_API_URL.includes('.onion')) {
        const proxyAgent = new SocksProxyAgent(process.env.TOR_PROXY_URL.replace('socks5://', 'socks5h://'));
        axiosConfig.httpAgent = proxyAgent;
        axiosConfig.httpsAgent = proxyAgent;
        axiosConfig.proxy = false;
        axiosConfig.timeout = 30000;
    }

    for (const [paymentHash, zapInfo] of pendingZaps.entries()) {
        try {
            const response = await axios.get(
                `${process.env.LNBITS_API_URL}/api/v1/payments/${paymentHash}`,
                {
                    headers: {
                        'X-Api-Key': process.env.LNBITS_INVOICE_KEY
                    },
                    ...axiosConfig
                }
            );
            
            if (response.data && response.data.paid) {
                await processZapPayment(paymentHash, response.data);
            }
            
        } catch (error) {
            console.error(`Error checking payment ${paymentHash}:`, error.message);
        }
    }
}

// Verificar pagos pendientes cada 10 segundos
setInterval(checkPendingPayments, 10000);

// Limpiar zaps pendientes antiguos cada 10 minutos
setInterval(() => {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    
    for (const [hash, zapInfo] of pendingZaps.entries()) {
        if (now - zapInfo.timestamp > tenMinutes) {
            pendingZaps.delete(hash);
        }
    }
}, 10 * 60 * 1000);

app.listen(PORT, '127.0.0.1', () => {
    console.log(`Lightning Address server running on localhost:${PORT}`);
    console.log(`Server pubkey: ${serverPubKey}`);
});
