// script.js - Entorno de Simulación PLC para EPET N°14
const canvas = document.getElementById('ladder-canvas');
let rungCount = 0;
let selectedRungContent = null;
let simulationInterval = null;
const PLC_STATE = {}; 
let deleteMode = false;

// Inicialización de variables del Robot
const robotVariables = [
    'M1_F', 'M1_B', 'FC1_F', 'FC1_B',
    'M2_F', 'M2_B', 'FC2_F', 'FC2_B',
    'M3_F', 'M3_B', 'FC3_F', 'FC3_B',
    'M4_F', 'M4_B', 'FC4_F', 'FC4_B'
];
robotVariables.forEach(v => PLC_STATE[v] = false);

// --- INTERFAZ Y CANVAS ---

// Configuración del botón Borrar en el HTML
document.getElementById('btn-delete').onclick = () => {
    deleteMode = !deleteMode;
    const btn = document.getElementById('btn-delete');
    
    if (deleteMode) {
        btn.style.backgroundColor = "var(--danger)";
        btn.style.color = "white";
        canvas.style.cursor = "crosshair"; // Cambia el cursor para indicar peligro
    } else {
        btn.style.backgroundColor = "";
        btn.style.color = "";
        canvas.style.cursor = "default";
    }
};

function createRung() {
    rungCount++;
    const rung = document.createElement('div');
    rung.className = 'rung';
    // Evento para seleccionar el renglón donde se soltarán los componentes
    rung.onclick = () => selectRung(rung.querySelector('.rung-content'));
    
    rung.innerHTML = `
        <div class="rail-left"></div>
        <div class="rung-content" data-rung-id="${rungCount}"></div>
        <div class="rail-right"></div>
    `;
    canvas.appendChild(rung);
    
    const content = rung.querySelector('.rung-content');
    selectRung(content); 
    return content;
}

function selectRung(contentArea) {
    // Quitar destaque visual de otros rungs
    document.querySelectorAll('.rung-content').forEach(r => r.parentElement.style.border = "none");
    // Destacar el seleccionado actual
    selectedRungContent = contentArea;
    selectedRungContent.parentElement.style.border = "1px solid #3498db";
}

function addComponentToCanvas(type) {
    const placeholder = canvas.querySelector('.rung-placeholder');
    if (placeholder) placeholder.remove();

    // Si no hay ninguno seleccionado, usa el último o crea uno nuevo
    if (!selectedRungContent) {
        let lastRung = canvas.querySelector('.rung:last-child');
        selectedRungContent = lastRung ? lastRung.querySelector('.rung-content') : createRung();
    }

    // Regla: Si intentamos poner una bobina donde ya hay una, creamos un nuevo Rung automáticamente
    const hasCoilInRung = selectedRungContent.querySelector('.COIL, .SR, .RESET_COIL');
    if (hasCoilInRung && (type === 'COIL' || type === 'SR' || type === 'RESET_COIL')) {
        createRung();
    }

    const component = document.createElement('div');
    component.className = `ladder-item ${type}`;

    let innerHTML = `<div class="symbol">${getSymbol(type)}</div>`;
    if (type === 'TON' || type === 'TOF') {
        innerHTML += `<input type="number" class="time-val" value="3" min="0.1" step="0.1">`;
    }
    innerHTML += `<input type="text" class="var-label" placeholder="TAG" 
                   oninput="updateMonitor(this)" onblur="updateMonitor(this)">`;

    component.innerHTML = innerHTML;

    // Borrado con click derecho
    component.oncontextmenu = (e) => {
        e.preventDefault();
        const parentRung = component.closest('.rung');
        component.remove();
        if (parentRung.querySelector('.rung-content').children.length === 0) {
            parentRung.remove();
            selectedRungContent = null;
        }
    };

    selectedRungContent.appendChild(component);
}

function getSymbol(type) {
    const symbols = {
        'NO': '┤ ├',
        'NC': '┤/├',
        'COIL': '( )',
        'TON': '[TON]',
        'TOF': '[TOF]',
        'SR': '[ S ]',         // Set
        'RESET_COIL': '[ R ]' // Reset
    };
    return symbols[type] || '??';
}

// --- LÓGICA DEL MONITOR ---

function updateMonitor(input) {
    const tag = input.value.toUpperCase().trim();
    if (!tag) return;

    if (!(tag in PLC_STATE)) {
        PLC_STATE[tag] = false;
        refreshMonitor(); 
    }
}

function refreshMonitor() {
    const monitor = document.getElementById('variable-monitor');
    for (const key in PLC_STATE) {
        let existingItem = document.getElementById(`var-item-${key}`);
        if (!existingItem) {
            existingItem = document.createElement('div');
            existingItem.id = `var-item-${key}`;
            existingItem.className = 'var-item';
            existingItem.innerHTML = `
                <span>${key}</span>
                <input type="checkbox" id="check-${key}">
            `;
            monitor.appendChild(existingItem);

            const checkbox = existingItem.querySelector('input');
            checkbox.addEventListener('change', (e) => {
                PLC_STATE[key] = e.target.checked;
                if (simulationInterval) scanCycle(); 
            });
        }
        const check = document.getElementById(`check-${key}`);
        if (check && document.activeElement !== check) {
            check.checked = PLC_STATE[key];
        }
    }
}

function syncMonitorCheckboxes() {
    for (const key in PLC_STATE) {
        const check = document.getElementById(`check-${key}`);
        if (check && document.activeElement !== check) {
            check.checked = PLC_STATE[key];
        }
    }
}

// --- MOTOR DE ESCANEO (PLC ENGINE) ---

function scanCycle() {
    const rungs = document.querySelectorAll('.rung');
    
    // 1. IMPORTANTE: Creamos el próximo estado partiendo de las memorias actuales (S/R)
    // Pero las bobinas normales (COIL) DEBEN reiniciarse a false en cada ciclo
    let nextState = { ...PLC_STATE }; 

    // Identificamos qué etiquetas pertenecen a bobinas normales para resetearlas
    document.querySelectorAll('.ladder-item.COIL .var-label').forEach(input => {
        const tag = input.value.toUpperCase().trim();
        if (tag) nextState[tag] = false; 
    });

    rungs.forEach(rung => {
        let powerFlow = true;
        const components = rung.querySelectorAll('.ladder-item');

        components.forEach(comp => {
            const type = comp.classList[1];
            const inputElement = comp.querySelector('.var-label');
            if (!inputElement) return;
            const tag = inputElement.value.toUpperCase().trim();
            if (!tag) return;

            // Lógica de Contactos (Leen el PLC_STATE estable del ciclo anterior)
            if (type === 'NO') {
                if (!PLC_STATE[tag]) powerFlow = false;
            }
            else if (type === 'NC') {
                if (PLC_STATE[tag]) powerFlow = false;
            }
            
            // Temporizador TON
            else if (type === 'TON') {
                const timeLimit = parseFloat(comp.querySelector('.time-val')?.value || 3);
                if (powerFlow) {
                    if (!comp.startTime) comp.startTime = Date.now();
                    const elapsed = (Date.now() - comp.startTime) / 1000;
                    comp.querySelector('.symbol').innerText = `[ ${elapsed.toFixed(1)}s ]`;
                    if (elapsed < timeLimit) powerFlow = false;
                } else {
                    comp.startTime = null;
                    comp.querySelector('.symbol').innerText = '[TON]';
                    powerFlow = false;
                }
            }

            // Lógica SET (S) - Solo escribe si hay flujo
            else if (type === 'SR') {
                if (powerFlow) {
                    nextState[tag] = true; 
                }
                powerFlow = nextState[tag];
            }

            // Lógica RESET (R) - Solo escribe si hay flujo
            else if (type === 'RESET_COIL') {
                if (powerFlow) {
                    nextState[tag] = false;
                }
                powerFlow = nextState[tag];
            }

            // Bobina Normal (COIL) - Depende estrictamente del powerFlow actual
            else if (type === 'COIL') {
                // Si hay flujo en este renglón, se enciende. Si no, se queda en el 
                // estado (false) que definimos al inicio del scan.
                if (powerFlow) {
                    nextState[tag] = true;
                }
            }

            // Feedback visual: Usamos el estado que estamos calculando (nextState)
            updateVisualState(comp, (type === 'COIL' || type === 'SR' || type === 'RESET_COIL') ? nextState[tag] : powerFlow);
        });
    });

    // 2. Al final del scan, volcamos TODO el resultado al estado oficial
    Object.assign(PLC_STATE, nextState);
    syncMonitorCheckboxes();
}

function updateVisualState(element, isActive) {
    if (isActive) {
        element.classList.add('active');
    } else {
        element.classList.remove('active');
    }
}

// --- CONTROLES DE SIMULACIÓN ---

document.getElementById('run-btn').addEventListener('click', () => {
    if (checkLogicErrors()) {
        alert("Error: Hay componentes sin etiqueta (TAG).");
        return;
    }
    simulationInterval = setInterval(scanCycle, 100);
    document.getElementById('run-btn').style.backgroundColor = "#27ae60";
});

document.getElementById('stop-btn').addEventListener('click', () => {
    clearInterval(simulationInterval);
    simulationInterval = null;
    document.getElementById('run-btn').style.backgroundColor = "";
});

document.getElementById('reset-btn').addEventListener('click', () => {
    clearInterval(simulationInterval);
    simulationInterval = null;
    document.getElementById('run-btn').style.backgroundColor = "";
    for (let key in PLC_STATE) PLC_STATE[key] = false;
    refreshMonitor();
});

function checkLogicErrors() {
    return Array.from(document.querySelectorAll('.var-label')).some(i => i.value.trim() === "");
}

// --- EVENTOS DRAG & DROP ---

document.addEventListener('DOMContentLoaded', () => {
    const draggables = document.querySelectorAll('.draggable');
    draggables.forEach(draggable => {
        draggable.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('type', e.target.getAttribute('data-type'));
            e.target.style.opacity = "0.5";
        });
        draggable.addEventListener('dragend', (e) => e.target.style.opacity = "1");
    });

    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        canvas.style.backgroundColor = "#f0f8ff";
    });

    canvas.addEventListener('dragleave', () => canvas.style.backgroundColor = "");

    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        canvas.style.backgroundColor = "";
        addComponentToCanvas(e.dataTransfer.getData('type'));
    });
});

// --- SISTEMA DE PERSISTENCIA (EXPORTAR / IMPORTAR) ---

// Función para Exportar el proyecto
// --- SISTEMA DE EXPORTACIÓN ROBUSTO (Uso de Blobs) ---
document.getElementById('btn-exp').addEventListener('click', () => {
    const rungsData = [];
    const rungs = document.querySelectorAll('.rung');

    if (rungs.length === 0) {
        alert("El diagrama está vacío. No hay nada que exportar.");
        return;
    }

    rungs.forEach(rung => {
        const components = [];
        // Seleccionamos solo los elementos dentro del área de contenido del rung
        rung.querySelectorAll('.ladder-item').forEach(comp => {
            components.push({
                type: comp.classList[1], // El tipo (NO, NC, COIL, SR, etc)
                tag: comp.querySelector('.var-label').value,
                time: comp.querySelector('.time-val')?.value || null
            });
        });
        rungsData.push(components);
    });

    // Convertimos el objeto a una cadena JSON
    const jsonString = JSON.stringify(rungsData, null, 2);
    
    // Creamos un Blob (Binary Large Object) para manejar los datos
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // Creamos una URL temporal para el archivo
    const url = URL.createObjectURL(blob);
    
    // Creamos el enlace de descarga
    const link = document.createElement('a');
    link.href = url;
    link.download = "proyecto_plc_lardet.json";
    
    // Forzamos la descarga y limpiamos la memoria
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log("Proyecto exportado exitosamente como Blob.");
});

// Función para Importar el proyecto
function importarProyecto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const rungsData = JSON.parse(e.target.result);
            
            // Limpiar canvas actual
            canvas.innerHTML = '';
            rungCount = 0;
            selectedRungContent = null;

            // Reconstruir Rungs y Componentes
            rungsData.forEach(rungItems => {
                const contentArea = createRung();
                rungItems.forEach(item => {
                    // Usamos la lógica de creación existente
                    addComponentToCanvas(item.type);
                    
                    // Asignar los valores guardados al último elemento creado
                    const lastComp = contentArea.lastChild;
                    if (lastComp) {
                        const labelInput = lastComp.querySelector('.var-label');
                        if (labelInput) {
                            labelInput.value = item.tag;
                            updateMonitor(labelInput); // Registrar en PLC_STATE
                        }
                        const timeInput = lastComp.querySelector('.time-val');
                        if (timeInput && item.time) {
                            timeInput.value = item.time;
                        }
                    }
                });
            });
            console.log("Proyecto importado con éxito.");
        } catch (err) {
            alert("Error al leer el archivo JSON: " + err.message);
        }
    };
    reader.readAsText(file);
}

function toggleMonitor() {
    const container = document.getElementById('side-monitor');
    container.classList.toggle('collapsed');
    
    // Opcional: Cambiar el texto del botón según el estado
    const btn = document.getElementById('toggle-monitor');
    if (container.classList.contains('collapsed')) {
        btn.innerText = "▲ Mostrar Monitor";
    } else {
        btn.innerText = "▼ Contraer Monitor";
    }
}

// Asegúrate de que al iniciar, el monitor esté disponible
document.addEventListener('DOMContentLoaded', () => {
    // ... resto de tus inits ...
    refreshMonitor(); 
});