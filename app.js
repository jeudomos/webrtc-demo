const path = require('path')
const fs = require('fs')
const express = require('express')
const app = express()


app.use((req,res,next)=>{
    next();
})
app.use(express.static(path.join(__dirname, 'public')));
app.get('', (req, res, next) => res.redirect('/index.html'));

const server = require('https').createServer({
    key: fs.readFileSync('./keys/key.pem'),
    cert: fs.readFileSync('./keys/cert.pem'),
    passphrase: "aa11aa"
}, app);
const io = require('socket.io')(server);

const clients = {};
io.on('connection', socket => {
        const id='C-'+new Date().getTime()+'-'+Math.round(Math.random()*10000);
        clients[id]=socket;
        socket.on('disconnect',()=>
        {
            delete clients[id];
            io.emit('clients',{clients: Object.getOwnPropertyNames(clients)});
        })
        .on('rtc', msg => {
            console.log(`rtc message for target [${msg.target}] [${msg.type}]`);
            const client = clients[msg.target];
            if (client) {
                console.log(`reflect message => ${msg.type}`)
                //changing target with caller id
                client.emit('rtc',{ ...msg, target: id });
            } else {
                console.log('no client')
            }
        })
        
        socket.emit('id', { id});
        io.emit('clients',{clients: Object.getOwnPropertyNames(clients)});
})

server.listen(3030)