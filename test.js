const axios = require('axios');
const fs = require('fs');
const qs = require('qs');
const path = require('path');
const moment = require('moment');
const { htmlToText } = require('html-to-text');

const clientId = 'L6VCCn9f87p4CeN6FNYL4IQqUS0ciyz8';
const clientSecret = '2Qj0nUV7KR20jUCHRVZSfHeUNKdtOftG';

async function getAccessToken() {
    try {
        const response = await axios.post(
            'https://api.helpscout.net/v2/oauth2/token',
            qs.stringify({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting access token:', error.response ? error.response.data : error.message);
    }
}

async function fetchConversations(page = 1, accessToken, startDate, endDate, retries = 3) {
    try {
        const response = await axios.get('https://api.helpscout.net/v2/conversations', {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
                status: 'all',
                page: page,
                query: `modifiedAt:[${startDate} TO ${endDate}]`
            }
        });
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 429 && retries > 0) {
            const retryAfter = error.response.headers['retry-after'] || 1;
            console.log(`Rate limited. Retrying after ${retryAfter} seconds...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return fetchConversations(page, accessToken, startDate, endDate, retries - 1);
        } else {
            console.error(`Error fetching conversations: ${error.message}`);
            return null;
        }
    }
}

async function fetchConversationDetails(conversationId, accessToken, retries = 3) {
    try {
        const response = await axios.get(`https://api.helpscout.net/v2/conversations/${conversationId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { embed: 'threads' }
        });
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 429 && retries > 0) {
            const retryAfter = error.response.headers['retry-after'] || 1;
            console.log(`Rate limited. Retrying after ${retryAfter} seconds...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return fetchConversationDetails(conversationId, accessToken, retries - 1);
        } else {
            console.error(`Error fetching conversation ${conversationId}: ${error.message}`);
            return null;
        }
    }
}

function formatConversation(conversation) {
    let formattedConversation = `Subject: ${conversation.subject}\nCreated At: ${conversation.createdAt}\n\nThreads:\n`;

    conversation.threads.forEach(thread => {
        formattedConversation += `Type: ${thread.type}\nCreated At: ${thread.createdAt}\nFrom: ${thread.from}\nBody:\n${htmlToText(thread.body)}\n\n`;
    });

    return formattedConversation;
}

async function exportConversationsForDecember() {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        console.error('Failed to get access token');
        return;
    }

    const startDate = moment().month('December').startOf('month').toISOString();
    const endDate = moment().month('December').endOf('month').toISOString();

    let page = 1;
    let allConversations = [];

    while (true) {
        console.log(`Fetching conversations - Page ${page}`);
        const conversationsData = await fetchConversations(page, accessToken, startDate, endDate);

        if (!conversationsData || !conversationsData._embedded || conversationsData._embedded.conversations.length === 0) {
            console.log('No more conversations found, stopping.');
            break;
        }

        for (const conversation of conversationsData._embedded.conversations) {
            console.log(`Fetching details for conversation ID: ${conversation.id}`);
            const conversationDetails = await fetchConversationDetails(conversation.id, accessToken);
            if (conversationDetails) {
                allConversations.push({
                    id: conversationDetails.id,
                    subject: conversationDetails.subject,
                    createdAt: conversationDetails.createdAt,
                    threads: conversationDetails._embedded.threads.map(thread => ({
                        type: thread.type,
                        createdAt: thread.createdAt,
                        body: htmlToText(thread.body),
                        from: thread.createdBy.email
                    }))
                });
            }
        }
        // Move to the next page
        page++;
    }

    // Format and save to a text file
    const formattedConversations = allConversations.map(formatConversation).join('\n\n');
    fs.writeFileSync(`conversations_december.txt`, formattedConversations);
    console.log(`Conversations exported to conversations_december.txt`);
}

exportConversationsForDecember();

// const main = async () => {
//     const url = "https://server-us-15.poshsidekick.com/";
//     const newServerUrl = "https://server-us-16.poshsidekick.com/";
//     const axiosInstance = axios.create({
//         baseURL: url,
//     });

//     try {
//         const response = await axiosInstance.get("/getUsersByField", {
//             params: {
//                 field: 'email',
//                 value: 'jloyd9836@gmail.com'
//             }
//         });

//         const users = response.data.data;

//         if (users && users.length > 0) {
//             const { id, email } = users[0];
//             const transfer = await axiosInstance.post("/user-transfer", {
//                 userId: id,
//                 newServerUrl
//             });
//             console.log(`User with email ${email} transferred successfully.`, transfer.data);
//         } else {
//             console.log('User with email jloyd9836@gmail.com not found.');
//         }
//     } catch (error) {
//         console.error('Error:', error);
//     }
// };

// main();