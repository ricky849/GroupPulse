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


function getStoredGroupMetadata() {
    if (!fs.existsSync('messages.jsonl')) return { lastTimestampMs: 0, targetGroupId: null };
    
    const fileContent = fs.readFileSync('messages.jsonl', 'utf-8').trim();
    if (!fileContent) return { lastTimestampMs: 0, targetGroupId: null };

    const lines = fileContent.split('\n');
    let lastTimestampMs = 0;
    let targetGroupId = null;

    for (let i = lines.length - 1; i >= 0; i--) {
        try {
            const data = JSON.parse(lines[i]);
            if (!lastTimestampMs && data.timestamp) {
                lastTimestampMs = new Date(data.timestamp).getTime();
            }
            if (!targetGroupId && data.groupId) {
                targetGroupId = data.groupId;
            }
            if (lastTimestampMs && targetGroupId) break;
        } catch (err) {
            continue;
        }
    }
    return { lastTimestampMs, targetGroupId };
}


async function processAndLogMessage(msg, existingChat = null, targetGroupId = null) {
    try {
        const isGroupMessage = msg.from.endsWith('@g.us') || (msg.to && msg.to.endsWith('@g.us'));
        if (!isGroupMessage) return false;

        const chat = existingChat || (await msg.getChat().catch(() => null));
        const currentGroupId = chat ? chat.id._serialized : (msg.from.endsWith('@g.us') ? msg.from : msg.to);

        // Primary Match: Permanent Group ID. Fallback Match: Name containing 'mandemo'
        const isTargetGroup = targetGroupId 
            ? currentGroupId === targetGroupId 
            : (chat && chat.name.toLowerCase().includes('mandemo'));

        if (!isTargetGroup) return false;

        const contact = await msg.getContact().catch(() => null);
        const groupName = chat ? chat.name : 'Unknown Group';
        const timestamp = new Date(msg.timestamp * 1000).toISOString();
        const sender = contact ? (contact.pushname || contact.name || contact.number) : (msg.author || msg.from);
        const body = msg.body || (msg.hasMedia ? `[Media: ${msg.type}]` : '[Empty/System Message]');

        console.log(`[${timestamp}] [${groupName}] ${sender}: ${body}`);

        const logEntry = JSON.stringify({
            messageId: msg.id._serialized,
            timestamp,
            groupId: currentGroupId,
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
        return true;
    } catch (err) {
        console.error('Error processing message:', err.message);
        return false;
    }
}


async function backfillMissingMessages() {
    const { lastTimestampMs, targetGroupId } = getStoredGroupMetadata();
    
    if (lastTimestampMs === 0) {
        console.log('No previous message timestamp found. Skipping backfill.');
        return;
    }

    const lastDateStr = new Date(lastTimestampMs).toISOString();
    console.log(`Searching for missed messages sent after ${lastDateStr}...`);

    try {
        const chats = await client.getChats();
        

        const targetChat = chats.find(c => c.isGroup && (
            (targetGroupId && c.id._serialized === targetGroupId) || 
            c.name.toLowerCase().includes('mandemo')
        ));

        if (!targetChat) {
            console.log('Target group chat not found in active chats list.');
            return;
        }

        console.log(`Target group identified as: "${targetChat.name}" (ID: ${targetChat.id._serialized})`);

        const history = await targetChat.fetchMessages({ limit: Infinity }).catch(() => []);
        history.sort((a, b) => (a.timestamp * 1000) - (b.timestamp * 1000));

        console.log(`Retrieved ${history.length} messages from WhatsApp history.`);

        let recoveredCount = 0;
        for (const msg of history) {
            const msgTimeMs = msg.timestamp * 1000;
            if (msgTimeMs > lastTimestampMs) {
                const success = await processAndLogMessage(msg, targetChat, targetChat.id._serialized);
                if (success) recoveredCount++;
            }
        }

        console.log(`Backfill complete. Recovered ${recoveredCount} missed messages.`);
    } catch (err) {
        console.error('Backfill error:', err.message);
    }
}

client.on('loading_screen', (percent, message) => {
    console.log(`Loading WhatsApp Web: ${percent}% - ${message}`);
});

client.on('qr', (qr) => {
    console.log(`\nScan QR code with WhatsApp on your phone:\n`);
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('GroupPulse is connected.');
    await backfillMissingMessages();
    console.log('GroupPulse is actively listening for live messages.');
});


client.on('message_create', async (msg) => {
    const { targetGroupId } = getStoredGroupMetadata();
    await processAndLogMessage(msg, null, targetGroupId);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('Initializing headless Chrome browser. Please wait 15-30 seconds.');
client.initialize();