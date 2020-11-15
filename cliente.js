const readline = require('readline');
const Mediador = require('./mediador.js');
const AlmacenMensajes = require('./almacenMensajes.js');
const Reloj = require('./reloj.js');
const ListaConectados = require('./listaConectados.js');

const zmq = require('zeromq');

const configCliente = require('./config_cliente.json');

const ID_CLIENTE = process.argv[2];

const FIN = "bye";
const MOSTRAR_USUARIOS = "showusers";
const ESCRIBIR_MSJ = "write";
const ESCRIBIR_MSJ_TODOS = "writeall";
const ESCRIBIR_EN_GRUPO = "writegroup";
const UNIRSE_GRUPO = "group";

const TOPICO_HB = "heartbeat";
const TOPICO_ALL = "message/all";
const PREFIJO_TOPICO = "message/";

const socketAll = zmq.socket('sub'), socketHeartbeat = zmq.socket('sub'), socketCliente = zmq.socket('sub');

const listaSockets = new Map();
const cacheBroker = new Map(); // [idCliente, broker]
var ipBrokerAll, ipBrokerHB, puertoBrokerAll, puertoBrokerHB, ipBrokerCliente, puertoBrokerCliente;
var reloj;
var almacenMensajes;
var mediador;
var listaConectados;

async function arranque() {

    console.log('\x1b[33m%s\x1b[0m', "Bienvenido " + ID_CLIENTE + "!.");

    reloj = new Reloj(configCliente.ipNTP, configCliente.puertoNTP, configCliente.periodoReloj,"false");
    mediador = new Mediador(configCliente.ipCoordinador, configCliente.puertoCoordinador);
    almacenMensajes = new AlmacenMensajes(ID_CLIENTE);
    listaConectados = new ListaConectados(reloj, configCliente.plazoMaxHeart, configCliente.periodoListaHeart);

    const msjInicioSesion = {
        "idPeticion": "",
        "accion": "2",
        "topico": ID_CLIENTE
    }

    let respuestaSesion = await mediador.iniciarSesion(msjInicioSesion);

    if (respuestaSesion.exito) {

        ipBrokerAll = respuestaSesion.resultados.datosBroker[0].ip;
        puertoBrokerAll = respuestaSesion.resultados.datosBroker[0].puerto;
        ipBrokerHB = respuestaSesion.resultados.datosBroker[1].ip;
        puertoBrokerHB = respuestaSesion.resultados.datosBroker[1].puerto;
        ipBrokerCliente = respuestaSesion.resultados.datosBroker[2].ip;
        puertoBrokerCliente = respuestaSesion.resultados.datosBroker[2].puerto;

        socketAll.connect('tcp://' + ipBrokerAll + puertoBrokerAll);
        socketAll.subscribe(respuestaSesion.resultados.datosBroker[0].topico);
        socketHeartbeat.connect('tcp://' + ipBrokerHB + puertoBrokerHB);
        socketHeartbeat.subscribe(respuestaSesion.resultados.datosBroker[1].topico);
        socketCliente.connect('tcp://' + ipBrokerCliente + puertoBrokerCliente);
        socketCliente.subscribe(respuestaSesion.resultados.datosBroker[2].topico);

        socketAll.on('message', recibirMensaje);
        socketHeartbeat.on('message', recibirHB);
        socketCliente.on('message', recibirMensaje);

        setInterval(emitirHeartbeat, configCliente.periodoHeartbeat);
    }
    else {
        //hay que ver si se agrega algun error que pueda llegar aca.
    }
    
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on('line', function (comando) {
    const comandoAct = comando.split(' ');
    if (comandoAct[0] != FIN) {
        if (comandoAct[0] === MOSTRAR_USUARIOS) {
            showusers();
        }
        else
        if (comandoAct[0] === ESCRIBIR_MSJ){
            write(comandoAct);
        }
        else
        if (comandoAct[0] === ESCRIBIR_MSJ_TODOS) {
            writeall(comandoAct);
        }
        else
        if (comandoAct[0] === ESCRIBIR_EN_GRUPO) {
            if (comandoAct.length === 2) {
                perteneceAGrupo(comandoAct);
            }
            else {
                logearError("Cantidad invalida de argumentos");
            }
        }
        else
        if (comandoAct[0] === UNIRSE_GRUPO) {
            if (comandoAct.length === 2) {
                grupo(comandoAct[1]);
            }
            else {
                logearError("Cantidad invalida de argumentos");
            }
        }
        else {
            logearError("Comando erroneo... intente nuevamente");
        }
    }
    else {
        //cerrar todo socket, etc...
        rl.close();
    }
});

function perteneceAGrupo(comandoAct) {
    const topico = comandoAct[1];

    if (cacheBroker.has(topico)) {
        let mensaje = await preguntar("Mensaje: ");
        if (mensaje === "") {
            logearError("No se puede enviar un mensaje vacio!")
        }
        else {
            prepararMensaje("message/"+topico, mensaje);
        }
    }
    else {
        logearError("Usted no pertenece al grupo al que quiere escribir.");
    }

}

function logearError(mensaje) {
    console.log("\033[31m" + mensaje + "\x1b[37m")
}

function logearTexto(mensaje) {
    console.log("\x1b[33m" + mensaje + "\x1b[37m"); 
}

function nuevaOperacionConsola() {
    console.log('\x1b[33m%s\x1b[0m', "/*---------------------------------------*/");
    console.log('\x1b[33m%s\x1b[0m', "Escriba un comando para continuar...");
}

function preguntar(pregunta) {
    return new Promise((resolve, reject) => {
        rl.question(pregunta, (input) => resolve(input));
    });
}

function perteneceAGrupo(comandoAct) {
    const topico = comandoAct[1];

    if (cacheBroker.has(topico)) {
        let mensaje = await preguntar("Mensaje: ");
        if (mensaje === "") {
            logearError("No se puede enviar un mensaje vacio!")
        }
        else {
            prepararMensaje("message/" + topico, mensaje);
        }
    }
    else {
        logearError("Usted no pertenece al grupo al que quiere escribir.");
    }
    nuevaOperacionConsola();
}

async function write(comandoAct) {
    if (comandoAct.length === 2) {
        const idReceptor = comandoAct[1];
        let mensaje = await preguntar("Mensaje: ");
        if (mensaje === "") {
            logearError("No se puede enviar un mensaje vacio!")
        }
        else {
            prepararMensaje(idReceptor, mensaje);
        }
     }
    else {
        logearError("Cantidad invalida de argumentos");
    }
    nuevaOperacionConsola();
}

async function writeall(comandoAct) {
    let mensaje = await preguntar("Mensaje: ");
    if (mensaje == "") {
        logearError("No se puede enviar un mensaje vacio!")
    }
    else {
        prepararMensaje("all", mensaje);
    }
    nuevaOperacionConsola();
}

function showusers() {
    const listaUsuarios = listaConectados.obtenerLista(); //devuelve entries
    console.log('\x1b[33m%s\x1b[0m', "/*---------------------------------------*/");
    console.log("Usuarios conectados: ");
    console.log('\x1b[33m%s\x1b[0m', " ");
    for (let [key, value] of listaUsuarios) {
        console.log(key + " - " + value)
    }
    console.log('\x1b[33m%s\x1b[0m', "/*---------------------------------------*/");
    nuevaOperacionConsola();
}

function grupo(idGrupo) {
    const request = {
        "idPeticion": "", // este valor se setea en el mediador
        "accion": "7",
        "topico": "message/" + idGrupo,
    }

    function callbackGrupo(rtaCoord) {
        if (rtaCoord.grupoNuevo == true) {
            logearTexto("El grupo se ha creado correctamente!");
        }
        else {
            logearTexto("Se lo ha agregado al grupo correctamente!");
        }

        const brokerGrupo = rtaCoord.resultados.datosBroker[0];
        cacheBroker.set(idGrupo, { ip: brokerGrupo.ip, puerto: brokerGrupo.puerto });

        const socket = zmq.socket('sub');
        socket.connect(`tcp://${brokerGrupo.ip}:${brokerGrupo.puerto}`);
        socket.on("message", recibirMensaje);
        listaSockets.set(idGrupo, socket); // agrego el socket a la lista de grupos
    }

    logearTexto("Solicitando operacion...");
    Mediador.pedirAlCoord(request, callbackGrupo);
    nuevaOperacionConsola();
}

function enviarMensaje(broker, topico, mensaje) {
    const socket = zmq.socket('pub');

    socket.connect(`tcp://${broker.ip}:${broker.puerto}`);

    socket.on('connect', function (fd, ep) {
        socket.send([topico, JSON.stringify(mensaje)]);
        sock.unmonitor();
        sock.close();
    });
    sock.monitor(100, 0);
}

function prepararMensaje(idReceptor, stringMensaje) {
    const horaAct = reloj.solicitarTiempo();
    const topico = PREFIJO_TOPICO + idReceptor;
    const objMensaje = {
        "emisor": ID_CLIENTE,
        "mensaje": stringMensaje,
        "fecha": horaAct.toISOString()
    }
    if (topico == TOPICO_ALL) {
        enviarMensaje({
            "ip": ipBrokerAll,
            "puerto": puertoBrokerAll
        }, topico, objMensaje);
    }
    else {
        if (cacheBroker.has(idReceptor)) {
            enviarMensaje(cacheBroker.get(idReceptor), topico, objMensaje); 
        }
        else {
            const request = {
                "idPeticion": "", // este valor se setea en el mediador
                "accion": "1",
                "topico": PREFIJO_TOPICO + idReceptor,
            }

            function callback(respuesta)  // la respuesta es la del formato oficial 
            {
                const rtaCoord = JSON.parse(respuesta);
                cacheBroker.set(idReceptor, {
                    "ip": rtaCoord.resultados.ip,
                    "puerto": rtaCoord.resultados.puerto
                }); 
                enviarMensaje(cacheBroker.get(idReceptor), topico, objMensaje);
            }
            mediador.pedirAlCoord(request, callback);
        }
    }

}  

function recibirMensaje(topico, mensaje){
    almacenMensajes.almacenarMensaje(topico, mensaje);
    logearTexto("[" + topico + " | " + mensaje.emisor + " | " + mensaje.fecha + " | " + mensaje.mensaje + "]"); //quiza convenga recortar un poco la fecha
}


function recibirHB(topico, mensaje) {
    const msjHB = JSON.parse(mensaje);
    listaConectados.actualizarHeartbeat(msjHB);
}

function emitirHeartbeat() {
    const brokerHB = {
        "ip": ipBrokerHB,
        "puerto": puertoBrokerHB
    }

    const msjHB = {
        "emisor": ID_CLIENTE,
        "fecha": reloj.solicitarTiempo().toISOString()
    }

    enviarMensaje(brokerHB, TOPICO_HB, msjHB);
}

arranque();
nuevaOperacionConsola();