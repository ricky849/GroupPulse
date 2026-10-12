const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        executablePath: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        args: [
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});


client.on('qr', (qr) => {
    console.log(`\n Scan QR code with WhatsApp on your phone:\n`);
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('GroupPulse is connected and Listening!');
});

client.on('message_create', async (msg) => {
    try {

        const isGroupMessage = msg.from.endsWith('@g.us') || (msg.to && msg.to.endsWith('@g.us'));
        if (!isGroupMessage) return;

        const chat = await msg.getChat().catch(() => null);
        const contact = await msg.getContact().catch(() => null);

        const groupName = chat ? chat.name : 'Unknown Group';

        if (groupName !== 'el mandemo' && chat?.name !== 'el mandemo') return;
        
        const timestamp = new Date(msg.timestamp * 1000).toISOString();
        const sender = contact ? (contact.pushname || contact.name || contact.number) : (msg.author || msg.from);
        const body = msg.body || (msg.hasMedia ? `[Media: ${msg.type}]` : '[Empty/System Message]');
console.log(`[${timestamp}] [${groupName}] ${sender}: ${body}`);

        const logEntry = JSON.stringify({
            timestamp,
            groupId: chat ? chat.id._serialized : (msg.from.endsWith('@g.us') ? msg.from : msg.to),
            groupName,
            sender,
            senderId: msg.author || msg.from,
            body: msg.body || null,
            type: msg.type,
            hasMedia: msg.hasMedia,
            isForwarded: msg.isForwarded || false,
            mentionedIds: msg.mentionedIds || [],
            hasQuotedMsg: msg.hasQuotedMsg || false,
            quotedMsgId: msg.hasQuotedMsg && msg._data && msg._data.quotedStanzaID ? msg._data.quotedStanzaID : null
        }) + '\n';

        fs.appendFileSync('messages.jsonl', logEntry);

    } catch (error) {
        console.error('Error processing message:', error.message);
    
    }
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

client.initialize();