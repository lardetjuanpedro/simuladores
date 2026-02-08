// animacion.js - Motor 3D con Gripper (Pinza)
let scene, camera, renderer;
let base, arm1, arm2; 
let fingerL, fingerR; // Variables para la pinza

function init3D() {
    const container = document.getElementById('threejs-container');
    if (!container) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 1, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.innerHTML = ''; 
    container.appendChild(renderer.domElement);

    // Luces
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 7);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x404040));

    // --- CONSTRUCCIÓN DEL ROBOT ---
    // Base
    const baseGeo = new THREE.CylinderGeometry(1, 1, 0.5, 32);
    base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x3498db }));
    scene.add(base);

    // Hombro (Arm 1)
    const arm1Geo = new THREE.BoxGeometry(0.4, 2, 0.4);
    arm1 = new THREE.Mesh(arm1Geo, new THREE.MeshStandardMaterial({ color: 0x2ecc71 }));
    arm1.position.y = 1;
    window.shoulder = new THREE.Group();
    window.shoulder.position.y = 0.25;
    window.shoulder.add(arm1);
    base.add(window.shoulder);

    // Codo (Arm 2)
    const arm2Geo = new THREE.BoxGeometry(0.3, 1.5, 0.3);
    arm2 = new THREE.Mesh(arm2Geo, new THREE.MeshStandardMaterial({ color: 0xe74c3c }));
    arm2.position.y = 0.75;
    window.elbow = new THREE.Group();
    window.elbow.position.y = 1.8;
    window.elbow.add(arm2);
    window.shoulder.add(window.elbow);

    // --- PINZA (GRIPPER) ---
    const fingerGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);
    const fingerMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    
    fingerL = new THREE.Mesh(fingerGeo, fingerMat);
    fingerR = new THREE.Mesh(fingerGeo, fingerMat);
    
    // Posición inicial de los dedos al final del Arm 2
    fingerL.position.set(-0.1, 1.5, 0);
    fingerR.position.set(0.1, 1.5, 0);
    
    window.elbow.add(fingerL);
    window.elbow.add(fingerR);

    animate();
}

function animate() {
    requestAnimationFrame(animate);
    if (typeof updateRobotPhysics === 'function') {
        updateRobotPhysics();
    }
    renderer.render(scene, camera);
}

function updateRobotPhysics() {
    // GUARDIA: Evita errores si el PLC o las piezas no están listos
    if (typeof PLC_STATE === 'undefined' || !base || !window.shoulder || !window.elbow || !fingerL) return;

    // Movimiento Base (Eje 1)
    if (PLC_STATE['M1_F'] && !PLC_STATE['FC1_F']) base.rotation.y += 0.02;
    if (PLC_STATE['M1_B'] && !PLC_STATE['FC1_B']) base.rotation.y -= 0.02;

    // Movimiento Hombro (Eje 2)
    if (PLC_STATE['M2_F'] && !PLC_STATE['FC2_F']) window.shoulder.rotation.z += 0.02;
    if (PLC_STATE['M2_B'] && !PLC_STATE['FC2_B']) window.shoulder.rotation.z -= 0.02;

    // Movimiento Codo (Eje 3)
    if (PLC_STATE['M3_F'] && !PLC_STATE['FC3_F']) window.elbow.rotation.z += 0.02;
    if (PLC_STATE['M3_B'] && !PLC_STATE['FC3_B']) window.elbow.rotation.z -= 0.02;

    // Movimiento Pinza (Eje 4)
    if (PLC_STATE['M4_F']) { // Abrir
        if (fingerL.position.x > -0.3) {
            fingerL.position.x -= 0.01;
            fingerR.position.x += 0.01;
        }
    }
    if (PLC_STATE['M4_B']) { // Cerrar
        if (fingerL.position.x < -0.05) {
            fingerL.position.x += 0.01;
            fingerR.position.x -= 0.01;
        }
    }

    // Actualizar Fines de Carrera virtuales para la pinza
    PLC_STATE['FC4_F'] = (fingerL.position.x <= -0.3);
    PLC_STATE['FC4_B'] = (fingerL.position.x >= -0.05);
}

window.onload = init3D;