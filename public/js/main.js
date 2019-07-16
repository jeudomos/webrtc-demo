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
                client.sendChannel = client.comm.createDataChannel('sendDataChannel');
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
                    event.channel.addEventListener('message', event => {
                        console.log(chat);
                        sendChat(client.id, event.data);
                    })
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
                            console.dir(video);
                            video.play().then(() => console_log("VIDEO PLAY START")).catch(err => console_log("ERROR VIDEO", err))
                        };
                    }
                    console.dir(video);
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
    <div><textarea client-id="${id}" cols="30" rows="10"></textarea><button client-id="s-${id}">Send</button></div>
    <video client-id="${id}"></video>`
    clientsContainer.appendChild(li);
    const btn = document.querySelector(`button[client-id="${id}"]`);
    const client = { id };
    const btnSend = document.querySelector(`button[client-id="s-${id}"]`);
    btnSend.addEventListener('click', event => {
        event.preventDefault();
        const txt = document.querySelector(`textarea[client-id="${client.id}"]`);
        console_log('send value', txt.value);
        client.sendChannel.send(txt.value);
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
                        console.dir(video);
                        video.play().then(() => console_log("VIDEO PLAY START")).catch(err => console_log("ERROR VIDEO", err))
                    };
                }
            })
            client.sendChannel = client.comm.createDataChannel("sendData");
            client.comm.addEventListener('datachannel', event => {
                event.channel.addEventListener('message', event => {
                    sendChat(client.id, event.data);
                });
            })
        } else
            console_log('channel already reserved')
        if (localStream) {
            createOffer(client);
        }
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
    console_log(client);
    client.comm.addStream(localStream);
    console_log('creating offer')
    client.comm.createOffer({ offerToReceiveVideo: 1 }).then(description => {
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