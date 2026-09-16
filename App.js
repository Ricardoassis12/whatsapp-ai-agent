import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@adiwajshing/baileys';
import qrcode from 'qrcode-terminal';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Carrega as variáveis secretas do arquivo .env
dotenv.config();

// Configura a Inteligência Artificial (ChatGPT)
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Mensagem de instrução que molda a personalidade da IA
const CONTEXTO_DA_EMPRESA = `
Você é a Larissa, assistente virtual inteligente da clínica OdontoClean.
Seu objetivo é ser muito educada, tirar dúvidas sobre clareamento e aparelhos dentários, e sempre tentar agendar uma consulta.
Responda de forma curta e direta, usando no máximo 3 frases por mensagem. Use emojis amigáveis.
`;

async function conectarAoWhatsApp() {
    // Salva a sessão para você não precisar ler o QR Code toda vez
    const { state, saveCreds } = await useMultiFileAuthState('session_auth');

    const sock = makeWASocket.default({
        auth: state,
        printQRInTerminal: false // Vamos usar a biblioteca qrcode-terminal para ficar mais bonito
    });

    // Mostra o QR Code no terminal do seu computador para você escanear com o celular
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('📌 ESCANEIE O QR CODE ABAIXO COM O SEU WHATSAPP:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const deveriaReconectar = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada. Tentando reconectar...', deveriaReconectar);
            if (deveriaReconectar) conectarAoWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ Robô de IA conectado com sucesso ao WhatsApp!');
        }
    });

    // Salva as credenciais sempre que houver alteração
    sock.ev.on('creds.update', saveCreds);

    // Escuta quando uma nova mensagem chega no WhatsApp
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return; // Ignora se não tiver texto ou se for mensagem enviada por você mesmo

        const de = msg.key.remoteJid;
        const textoRecebido = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!textoRecebido) return;

        console.log(`💬 Mensagem recebida de ${de}: ${textoRecebido}`);

        try {
            // Envia a mensagem do cliente para o ChatGPT processar
            const respostaIA = await openai.chat.completions.create({
                model: "gpt-3.5-turbo", // Modelo rápido e muito barato
                messages: [
                    { role: "system", content: CONTEXTO_DA_EMPRESA },
                    { role: "user", content: textoRecebido }
                ],
            });

            const respostaTexto = respostaIA.choices[0].message.content;

            // Envia a resposta inteligente de volta para o cliente no WhatsApp
            await sock.sendMessage(de, { text: respostaTexto });
            console.log(`🤖 IA Respondeu: ${respostaTexto}`);

        } catch (erro) {
            console.error("Erro ao processar com a IA:", erro);
        }
    });
}

conectarAoWhatsApp();
