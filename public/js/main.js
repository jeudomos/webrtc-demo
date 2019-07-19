const socket = io();
let id;
let clients = {};
let localStream;
const clientsContainer = document.querySelector('#clients');
const chat = document.querySelector('#chat');

var pcConfig = {
    'iceServers': [{
        'urls': 'stun:stun.l.google.com:19302'
    }]
};

function handleBinaryChannel(client, event) {
    client.inpBuffer=[];
    client.inpBufferLength=0;
    event.channel.addEventListener('message',event=>{
        console_log('DATA COMES');
        console.dir(event);
        client.inpBuffer.push(event.data);
        client.inpBufferLength+=event.data.byteLength;
        console_log(client.inpBufferLength,client.inpBuffer.length);
        if ( client.inpBufferLength >= client.confirmFileInfo.size) {
            console_log('YESSS COMPLET');
            const img=document.querySelector('#remoteImg');
            const blob=new Blob(client.inpBuffer);
            client.inpBuffer=[];
            img.src=URL.createObjectURL(blob);
            console_log(img.src)
        }
    })
}

function handleJsonChannel(client, event) {
    client.jsonChannel = event.channel;
    const fnSend = client.jsonChannel.send.bind(client.jsonChannel);
    client.jsonChannel.send = (data) => {
        console.log('RESULT is');
        console.log(data);
        fnSend(JSON.stringify(data));
    }
    event.channel.addEventListener('message', event => {
        handleJsonMessageEvent(client,event);
    })
}

function handleJsonMessageEvent(client, event) {
    console.log(event);
    const msg = JSON.parse(event.data);
    switch (msg.operation) {
        case "chat":
            sendChat(client.id, msg.message);
            break;
        case "upload":
            if (confirm(`${client.id} wants to send you ${msg.fileInfo.name}. Would you like to accept?`)) {
                client.jsonChannel.send({ operation: "upload_response", result: true });
                client.confirmFileInfo=msg.fileInfo;
            } else
                client.jsonChannel.send({ operation: "uploa_responsed", result: false });
            break;
        case "upload_response":
            if (msg.result) {
                client.dataChannel=client.comm.createDataChannel("file-upload");
                client.inpOffset=0;
                client.cnt=0;
                console_log('SEND FILE');
                console.log(client);
                sendFile(client);
            } else
                alert('decliened')
    }
}

function sendFile(client) {
    console_log('SENDING FILE');
    console.log(client);
    if(!client.reader.onload) {
        client.reader.onload=(event)=>{
            console.log('EVENT');
            console.log(event);
            console.log(client);
            client.inpOffset+=event.target.result.byteLength;
            console.log(client);
            client.dataChannel.send(event.target.result);
            console.log(client.inpOffset,client.inpFile.files[0].size);
            if (client.inpOffset < client.inpFile.files[0].size)
                sendFile(client);
            else
            {
                client.dataChannel.close();
                client.dataChannel=null;
            }
        }
    }
    if(client.inpOffset < client.inpFile.files[0].size) {
        const slice=client.inpFile.files[0].slice(client.inpOffset,client.inpOffset+32*1024);
        client.reader.readAsArrayBuffer(slice);
    }
}


socket
    .on('id', ({ id }) => setId(id))
    .on('clients', ({ clients }) => refreshClients(clients))
    .on('rtc', message => {
        console_log('message comes');
        console_log(message);
        const client = clients[message.target];
        if (client) {
            console_log('yes clients ok');
            if (!client.comm) {
                client.comm = new RTCPeerConnection(pcConfig);
                client.comm.addEventListener('icecandidate', event => {
                    if (event.candidate) {
                        console_log('ice candiate sending rtc');
                        socket.emit('rtc', {
                            type: 'icecandidate',
                            target: message.target,
                            candidate: event.candidate
                        });
                    }
                })
                client.comm.addEventListener('datachannel', event => {
                    console_log('DATA CHANNEL')
                    if (event.channel.label === "json") {
                        handleJsonChannel(client, event);
                    } else {
                        handleBinaryChannel(client, event);
                    }
                });
                client.comm.addEventListener('addstream', event => {
                    console_log('++++++++++stream added++++++++++')
                    const video = document.querySelector(`video[client-id="${message.target}"]`);
                    video.className = "video-active";
                    console_log(event.stream);
                    video.srcObject = event.stream;
                    if (!video.onloadedmetadata) {
                        video.onloadedmetadata = () => {
                            console_log('>>>>>>>>>>>>>>>>>>>>loaded meta');
                            console.log(video);
                            video.play().then(() => console_log("VIDEO PLAY START")).catch(err => console_log("ERROR VIDEO", err))
                        };
                    }
                    console.log(video);
                })
            }
            switch (message.type) {
                case "icecandidate":
                    console_log('ice candidate from remote');
                    console_log(message);
                    try {
                        client.comm.addIceCandidate(message.candidate).catch(err => console_log(`Error on add ice candidate ${err}`));
                    } catch (err) {
                        console_log('error during add ice');
                        console_log(err);
                    }
                    break;
                case "offer":
                    console_log('offer comes');
                    client.comm.setRemoteDescription(message.description).then(() => {
                        console_log('creating answer');
                        client.comm.createAnswer().then(description => {
                            console_log('setting our local');
                            client.comm.setLocalDescription(description);
                            console_log('sending remote anser');
                            socket.emit("rtc", {
                                type: "answer",
                                target: message.target,
                                description: description
                            })
                        })
                    });
                    break;
                case "answer":
                    console_log('answer comes, setting our local')
                    console_log(message);
                    client.comm.setRemoteDescription(message.description).then(() => {
                        console_log('SET LOCAL OK');
                    }).catch(err => console_log(err));
                    break;
            }
        } else
            console_log('no client')
    });

function setId(clientId) {
    id = clientId;
    document.querySelector('#id').innerHTML = id;
}
function refreshClients(newClients) {
    const ts = new Date().getTime();
    for (let client of newClients) {
        if (client !== id) {
            if (!clients[client]) {
                createClient(client);
            }
            clients[client].ts = ts;
        }
    }
    for (let client in clients) {
        if (clients[client].ts !== ts) {
            const node = document.querySelector('#' + client);
            node.parentNode.removeChild(node)
            delete clients[client]
        }
    }
}
function createClient(id) {
    let li = document.createElement('li');
    li.setAttribute('id', id)
    li.innerHTML = `
    <div><span>${id}</span><button client-id="${id}">Call</button></div>
    <div><input client-id="${id}" type="file"><button client-id="f-${id}">Send</button></div>
    <div><textarea client-id="${id}" cols="30" rows="10"></textarea><button client-id="s-${id}">Send</button></div>
    <video client-id="${id}"></video>`
    clientsContainer.appendChild(li);
    const btn = document.querySelector(`button[client-id="${id}"]`);
    const client = { id };
    client.inpFile = document.querySelector(`input[client-id="${id}"]`);
    client.reader=new FileReader();
    const btnFile = document.querySelector(`button[client-id="f-${id}"]`);
    btnFile.addEventListener('click', event => {
        file = client.inpFile.files[0];
        client.fileInfo = {
            name: file.name,
            size: file.size,
            type: file.type
        };
        client.jsonChannel.send({
            operation: "upload",
            fileInfo: client.fileInfo
        });
    });
    const btnSend = document.querySelector(`button[client-id="s-${id}"]`);
    btnSend.addEventListener('click', event => {
        event.preventDefault();
        const txt = document.querySelector(`textarea[client-id="${client.id}"]`);
        console_log('send value', txt.value);
        client.jsonChannel.send({
            operation: "chat",
            message: txt.value
        });
        sendChat("YOU", txt.value);
        txt.value = "";
    })
    btn.addEventListener('click', event => {
        console_log('calling')
        event.preventDefault();
        if (!client.comm) {
            client.comm = new RTCPeerConnection(pcConfig);
            client.comm.addEventListener('icecandidate', event => {
                if (event.candidate) {
                    console_log('event listener: icecand');
                    console_log(event.candidate)
                    socket.emit('rtc', {
                        type: 'icecandidate',
                        target: id,
                        candidate: event.candidate
                    });
                }
            })
            client.comm.addEventListener('addstream', event => {
                console_log('event listener :addstream');
                console_log(event);
                const video = document.querySelector(`video[client-id="${id}"]`);
                video.srcObject = event.stream;
                if (!video.onloadedmetadata) {
                    video.onloadedmetadata = () => {
                        console_log('>>>>>>>>>>>>>>>>>>>>loaded meta');
                        console.log(video);
                        video.play().then(() => console_log("VIDEO PLAY START")).catch(err => console_log("ERROR VIDEO", err))
                    };
                }
            })
            client.jsonChannel = client.comm.createDataChannel("json");
            client.jsonChannel.addEventListener('message',event=>handleJsonMessageEvent(client,event))
            const send = client.jsonChannel.send.bind(client.jsonChannel);
            console.log('------------ JSON CHANNEL ---------------')
            console.log(client.jsonChannel);
            client.jsonChannel.send = (data) => {
                send(JSON.stringify(data));
            }
            client.comm.addEventListener('datachannel', event => {
                if (event.channel.label === "json") {
                    handleJsonChannel(client, event);
                } else
                    handleBinaryChannel(client, event);
            })
        } else
            console_log('channel already reserved')
        createOffer(client);
    })
    clients[id] = client;
}

const startCam = document.querySelector("#startCam");
startCam.addEventListener('click', event => {
    event.preventDefault();
    if (localStream)
        return;
    navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    }).then(stream => {
        const vid = document.querySelector('#localVideo');
        if (!vid.onloadedmetadata) {
            vid.onloadedmetadata = function (e) {
                vid.play();
            };
        }
        console_log(vid);
        console_log(stream);
        vid.srcObject = stream;
        localStream = stream;
    })
});

function createOffer(client) {
    console_log('adding stream');
    //client.comm.addStream(localStream);
    client.comm.createOffer().then(description => {
        try {
            console_log('created offer setting local and sending offer rtc');
            console_log(description);
            console_log(client);
            client.comm.setLocalDescription(description).then(() => console_log('set local desc ok')).catch(err => console_log(`ERRRO ON SET LOCAL ${err}`));
            socket.emit('rtc', {
                type: 'offer',
                target: client.id,
                description: description
            });
        } catch (err) {
            console_log('errror during set local');
            console_log(err);
        }
    }).catch(err => console_log(`>>>>>>>>>> ${err}`));
}
const messages = document.querySelector('#messages');
function console_log(...args) {
    const now = new Date().getTime();// (window.performance.now() / 1000).toFixed(3);
    console.log(now, ...args);
    const msg = now;
    /*
    const p = document.createElement('p');
    p.innerText = msg + args.join(' ');
    messages.appendChild(p);
    */
}
function sendChat(id, msg) {
    if (chat.value.length > 0)
        chat.value += "\n";
    chat.value += id + ">>" + msg;
}