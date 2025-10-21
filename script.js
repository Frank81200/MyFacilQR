// Variables globales
let qr = null;
let lastCapturedImage = null;
let worker = null;
let lastOcrText = null;
let cameraStream = null;
let countdown = null;
const OCR_API_KEY = 'K84107818888957';

// Constantes para valores predeterminados
// Constantes para valores predeterminados
const DEFAULT_LOCATION = {
    first: 'A00',
    second: '01', 
    third: '001'
};

const DEFAULT_PRODUCT = {
    name: "Producto por defecto",
    sku: "000000",
    barcode: "0000000000000",
    barcodes: ["0000000000000"],
    location: `${DEFAULT_LOCATION.first}-${DEFAULT_LOCATION.second}-${DEFAULT_LOCATION.third}`,
    imageUrl: null,
    provider: "",
    glovoUrl: null,
    timestamp: new Date().toISOString()
};

// Variables para el cropper
let cropperSettings = {
    x: 0,
    y: 70,
    width: 100,
    height:20
};

// Estructura para almacenar productos escaneados
let scannedProducts = [];

// Variable para guardar el último producto escaneado
let lastScannedProduct = null;

// Inicialización cuando el DOM está cargado
document.addEventListener('DOMContentLoaded', function() {
    // Ocultar el contenedor principal inicialmente
    const mainQrContainer = document.querySelector('.qr-container');
    if (mainQrContainer) {
        mainQrContainer.style.display = 'none';
    }
    
    initializeSelects();
    loadSavedProducts();
    assignButtonEvents();
    
    // Cargar catálogo de productos desde el servidor
    loadProductCatalog();
    
    // Cargar producto predeterminado
    lastScannedProduct = {...DEFAULT_PRODUCT};
    
    // Mostrar directamente la vista de dos QR
    showProductAndLocationQr(lastScannedProduct);
});

// Función para inicializar los selects
// Función para inicializar los selects
function initializeSelects() {
    // Primer select: Letras del abecedario con "00"
    const firstSelect = document.getElementById('firstSelect');
    for (let i = 65; i <= 90; i++) { // 65 = 'A', 90 = 'Z'
        const letter = String.fromCharCode(i);
        const option = document.createElement('option');
        option.value = letter + '00';
        option.textContent = letter + '00';
        firstSelect.appendChild(option);
    }

    // Segundo select: Números del 01 al 15 (CORREGIDO)
    const secondSelect = document.getElementById('secondSelect');
    for (let i = 1; i <= 25; i++) {
        const num = i.toString().padStart(2, '0');
        const option = document.createElement('option');
        option.value = num;
        option.textContent = num;
        secondSelect.appendChild(option);
    }

    // Tercer select: Números del 001 al 025 (CORREGIDO)
    const thirdSelect = document.getElementById('thirdSelect');
    for (let i = 1; i <= 25; i++) {
        const num = i.toString().padStart(3, '0');
        const option = document.createElement('option');
        option.value = num;
        option.textContent = num;
        thirdSelect.appendChild(option);
    }

    // Seleccionar valores por defecto
    firstSelect.value = DEFAULT_LOCATION.first;
    secondSelect.value = DEFAULT_LOCATION.second;
    thirdSelect.value = DEFAULT_LOCATION.third;

    // Agregar eventos
    firstSelect.addEventListener('change', handleLocationChange);
    secondSelect.addEventListener('change', handleLocationChange);
    thirdSelect.addEventListener('change', handleLocationChange);
}
// Función para manejar cambios en los selects de ubicación
function handleLocationChange() {
    generateQR();
    
    if (lastScannedProduct) {
        const location = getCurrentLocation();
        if (location) {
            associateProductWithLocation(lastScannedProduct);
            showNotification(`✓ Ubicación ${location} asociada a ${lastScannedProduct.name || 'producto'}`, 'success');
            showProductAndLocationQr(lastScannedProduct);
        }
    }
}

// Función para asignar eventos a los botones
function assignButtonEvents() {
    document.getElementById('start-camera').addEventListener('click', startCamera);
    document.getElementById('voice-search-button').addEventListener('click', toggleVoiceSearch);
    document.getElementById('clear-button').addEventListener('click', clearAll);
}

// Función para mostrar notificaciones
function showNotification(message, type = 'info') {
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = 'notification';
    
    let bgColor;
    switch(type) {
        case 'success': bgColor = 'var(--gradient-success)'; break;
        case 'warning': bgColor = 'var(--gradient-warning)'; break;
        case 'error': bgColor = 'var(--gradient-danger)'; break;
        default: bgColor = 'var(--gradient-primary)';
    }
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${bgColor};
        color: white;
        padding: 12px 20px;
        border-radius: var(--border-radius);
        box-shadow: var(--shadow-lg);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
        max-width: 300px;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Catálogo de productos inicial (fallback si no se puede cargar desde servidor)
const INITIAL_CATALOG = [
    {
        name: "Plátano Canarias 1u",
        sku: "420063",
        barcode: "08940915250331",
        barcodes: ["08940915250331"],
        location: null
    }
    // Añade más productos aquí
];

// Función para cargar productos guardados
function loadSavedProducts() {
    try {
        const saved = localStorage.getItem('scannedProducts');
        if (saved) {
            scannedProducts = JSON.parse(saved);
            console.log('Productos cargados desde localStorage:', scannedProducts.length);
        } else {
            // Si no hay productos guardados, cargar catálogo inicial
            scannedProducts = [...INITIAL_CATALOG];
            saveProducts();
            console.log('Catálogo inicial cargado:', scannedProducts.length);
        }
    } catch (e) {
        console.error('Error al cargar productos guardados:', e);
    }
}

// Función para cargar catálogo desde el servidor
// Función para cargar catálogo desde el servidor
async function loadProductCatalog() {
    try {
        console.log('Intentando cargar catálogo...');
        
        const catalogUrl = window.location.origin + '/productos.json';
        console.log('URL del catálogo:', catalogUrl);
        
        const timestamp = new Date().getTime();
        const response = await fetch(`${catalogUrl}?v=${timestamp}`);
        
        if (!response.ok) {
            console.error('Error HTTP:', response.status);
            throw new Error(`Error al cargar catálogo: ${response.status}`);
        }
        
        const catalogProducts = await response.json();
        console.log('Catálogo recibido:', catalogProducts);
        
        if (!Array.isArray(catalogProducts)) {
            throw new Error('El formato del catálogo no es válido');
        }
        
        let newProductsCount = 0;
        
        // Convertir productos del nuevo formato al formato interno
        for (const product of catalogProducts) {
            const normalizedProduct = {
                name: product["Nombre del Producto"] || "Sin nombre",
                sku: product["SKU"] || "",
                barcode: String(product["Barcodes"] || ""),
                barcodes: [String(product["Barcodes"] || "")],
                location: product["Location"] || null,
                imageUrl: product["URL de Imagen"] || null,
                provider: product["Proveedor"] || "",
                glovoUrl: product["URL Datos Con Codigo de barras"] || null,
                timestamp: new Date().toISOString()
            };
            
            // Verificar si el producto ya existe
            const exists = scannedProducts.some(p => 
                (p.sku && normalizedProduct.sku && p.sku === normalizedProduct.sku) ||
                (p.barcode && normalizedProduct.barcode && p.barcode === normalizedProduct.barcode)
            );
            
            if (!exists) {
                scannedProducts.push(normalizedProduct);
                newProductsCount++;
            }
        }
        
        if (newProductsCount > 0) {
            saveProducts();
            console.log(`Catálogo cargado: ${newProductsCount} productos nuevos agregados`);
            showNotification(`Catálogo cargado: ${newProductsCount} productos nuevos`, 'success');
        } else {
            console.log('Todos los productos del catálogo ya existen');
            showNotification('Catálogo actualizado (sin cambios)', 'info');
        }
        
    } catch (error) {
        console.error('Error al cargar catálogo:', error);
        showNotification('No se pudo cargar el catálogo del servidor', 'warning');
    }
}

// Función para guardar productos en localStorage
function saveProducts() {
    try {
        localStorage.setItem('scannedProducts', JSON.stringify(scannedProducts));
    } catch (e) {
        console.error('Error al guardar productos:', e);
    }
}

function removeDuplicateProducts() {
    const uniqueProducts = [];
    const seenIdentifiers = new Set();
    
    for (const product of scannedProducts) {
        let identifier = null;
        
        if (product.barcodes && product.barcodes.length > 0) {
            identifier = product.barcodes[0];
        } else if (product.barcode) {
            identifier = product.barcode;
        } else if (product.sku) {
            identifier = `sku_${product.sku}`;
        } else if (product.name) {
            identifier = `name_${product.name.toLowerCase().trim()}`;
        }
        
        if (identifier && !seenIdentifiers.has(identifier)) {
            seenIdentifiers.add(identifier);
            uniqueProducts.push(product);
        } else if (!identifier) {
            uniqueProducts.push(product);
        }
    }
    
    return uniqueProducts;
}

function cleanDuplicates() {
    const originalCount = scannedProducts.length;
    scannedProducts = removeDuplicateProducts();
    const newCount = scannedProducts.length;
    const duplicatesRemoved = originalCount - newCount;
    
    saveProducts();
    
    if (duplicatesRemoved > 0) {
        showNotification(`Se eliminaron ${duplicatesRemoved} productos duplicados. Productos únicos: ${newCount}`, 'success');
        showSavedProducts();
    } else {
        showNotification('No se encontraron productos duplicados', 'info');
    }
}

// Función para asociar producto con ubicación actual
function associateProductWithLocation(productInfo) {
    if (!productInfo) return null;
    
    const location = getCurrentLocation();
    if (!location) return null;
    
    const existingIndex = scannedProducts.findIndex(p => 
        p.barcode === productInfo.barcode || 
        (p.barcodes && p.barcodes.includes(productInfo.barcode))
    );
    
    if (existingIndex >= 0) {
        scannedProducts[existingIndex].location = location;
        productInfo.location = location;
    } else {
        productInfo.location = location;
        scannedProducts.push(productInfo);
    }
    
    saveProducts();
    return location;
}

// Función para obtener ubicación actual de los selects
function getCurrentLocation() {
    const value1 = document.getElementById('firstSelect').value;
    const value2 = document.getElementById('secondSelect').value;
    const value3 = document.getElementById('thirdSelect').value;
    
    if (value1 && value2 && value3) {
        return `${value1}-${value2}-${value3}`;
    }
    return null;
}

// Función para buscar información del producto por código de barras
async function searchProductByBarcode(barcode) {
    try {
        showNotification('Buscando producto en internet...', 'info');
        
        // Intentar con Open Food Facts primero
        const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
        
        if (!response.ok) {
            throw new Error('No se encontró el producto');
        }
        
        const data = await response.json();
        
        if (data.status === 1 && data.product) {
            const product = data.product;
            
            // Crear modal con la información del producto
            showProductInfoModal({
                name: product.product_name || 'Sin nombre',
                brand: product.brands || 'Sin marca',
                image: product.image_url || product.image_front_url || null,
                barcode: barcode,
                categories: product.categories || 'Sin categoría',
                quantity: product.quantity || 'N/A'
            });
            
            showNotification('Producto encontrado', 'success');
        } else {
            // Si no se encuentra, buscar en Google Images
            searchProductImageGoogle(barcode);
        }
        
    } catch (error) {
        console.error('Error al buscar producto:', error);
        // Fallback a búsqueda de Google Images
        searchProductImageGoogle(barcode);
    }
}

// Función para buscar imagen en Google
function searchProductImageGoogle(barcode) {
    const searchUrl = `https://www.google.com/search?tbm=isch&q=${barcode}`;
    window.open(searchUrl, '_blank');
    showNotification('Abriendo búsqueda de imágenes...', 'info');
}

// Función para mostrar modal con información del producto
function showProductInfoModal(productData) {
    const scannerContainer = document.getElementById('scanner-container');
    
    let imageHtml = '';
    if (productData.image) {
        imageHtml = `<img src="${productData.image}" alt="${productData.name}" style="max-width: 100%; height: auto; border-radius: 8px; margin-bottom: 16px;">`;
    } else {
        imageHtml = `
            <div style="background: rgba(59, 130, 246, 0.1); padding: 40px; border-radius: 8px; text-align: center; margin-bottom: 16px;">
                <p style="color: var(--text-secondary);">No hay imagen disponible</p>
                <button onclick="searchProductImageGoogle('${productData.barcode}')" class="modal-button primary" style="margin-top: 12px;">
                    Buscar en Google Images
                </button>
            </div>
        `;
    }
    
    const html = `
        <div style="padding: 16px; max-height: 600px; overflow-y: auto;">
            <h2 style="font-size: 1.4rem; font-weight: 800; margin: 0 0 16px 0; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                Información del Producto
            </h2>
            
            ${imageHtml}
            
            <div style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.6) 100%); border-radius: var(--border-radius); padding: 16px; margin-bottom: 16px; border: 1px solid rgba(59, 130, 246, 0.2);">
                <div style="margin-bottom: 12px;">
                    <span style="color: var(--text-secondary); font-size: 0.875rem;">Nombre:</span>
                    <p style="color: var(--text-color); font-weight: 600; margin: 4px 0;">${productData.name}</p>
                </div>
                
                <div style="margin-bottom: 12px;">
                    <span style="color: var(--text-secondary); font-size: 0.875rem;">Marca:</span>
                    <p style="color: var(--text-color); font-weight: 600; margin: 4px 0;">${productData.brand}</p>
                </div>
                
                <div style="margin-bottom: 12px;">
                    <span style="color: var(--text-secondary); font-size: 0.875rem;">Código de barras:</span>
                    <p style="color: #34d399; font-weight: 700; font-family: monospace; margin: 4px 0;">${productData.barcode}</p>
                </div>
                
                <div style="margin-bottom: 12px;">
                    <span style="color: var(--text-secondary); font-size: 0.875rem;">Categoría:</span>
                    <p style="color: var(--text-color); font-weight: 600; margin: 4px 0;">${productData.categories}</p>
                </div>
                
                <div>
                    <span style="color: var(--text-secondary); font-size: 0.875rem;">Cantidad:</span>
                    <p style="color: var(--text-color); font-weight: 600; margin: 4px 0;">${productData.quantity}</p>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button onclick="showProductAndLocationQr(lastScannedProduct)" class="modal-button danger">
                    Cerrar
                </button>
                ${productData.image ? `
                <button onclick="searchProductImageGoogle('${productData.barcode}')" class="modal-button primary">
                    Más imágenes
                </button>
                ` : ''}
            </div>
        </div>
    `;
    
    scannerContainer.innerHTML = html;
}

// Función para mostrar ambos QR (producto y ubicación)
// Función para mostrar ambos QR (producto y ubicación) - VERSIÓN MEJORADA
// Función para mostrar ambos QR (producto y ubicación) - VERSIÓN MEJORADA Y CORREGIDA
function showProductAndLocationQr(productInfo) {
    const scannerContainer = document.getElementById('scanner-container');
    const mainQrContainer = document.querySelector('.qr-container');
    const countdownElement = document.getElementById('countdown');
    
    // Detener la cámara si está activa
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    // Ocultar elementos principales de la vista inicial
    if (mainQrContainer) {
        mainQrContainer.style.display = 'none';
    }
    
    if (countdownElement) {
        countdownElement.style.display = 'none';
    }
    
    // Limpiar QR anterior si existe
    if (qr) {
        qr.clear();
        document.getElementById('qrcode').innerHTML = '';
    }
    
    document.getElementById('qr-text').textContent = '';
    
    // Detener el contador si está activo
    if (countdown) {
        clearInterval(countdown);
        countdown = null;
    }
    
    // Obtener datos del producto y ubicación - SOLO PRIMER CÓDIGO (CORREGIDO)
    let barcode = '';
    if (productInfo.barcode) {
        // Si barcode es un string, tomar solo el primer código si hay comas
        barcode = String(productInfo.barcode).split(',')[0].trim();
    } else if (productInfo.barcodes && Array.isArray(productInfo.barcodes) && productInfo.barcodes.length > 0) {
        // Si es un array, tomar el primer elemento y convertir a string
        barcode = String(productInfo.barcodes[0]).split(',')[0].trim();
    }
    
    const location = productInfo.location || getCurrentLocation();
    
    // HTML para imagen del producto
    let imageHtml = '';
    if (productInfo.imageUrl) {
        imageHtml = `
            <div class="product-image-container">
                <img src="${productInfo.imageUrl}" alt="${productInfo.name}" class="product-image" 
                     onerror="this.parentElement.innerHTML='<div class=\'product-image-placeholder\'>❌ Imagen no disponible</div>'">
            </div>
        `;
    } else {
        imageHtml = `
            <div class="product-image-container">
                <div class="product-image-placeholder">📦 Sin imagen</div>
            </div>
        `;
    }
    
    // HTML para proveedor
    let providerHtml = '';
    if (productInfo.provider && productInfo.provider.trim() !== '') {
        providerHtml = `
            <span class="product-provider-badge">
                🏢 ${productInfo.provider}
            </span>
        `;
    }
    
    // HTML para botón de Glovo
    let glovoButtonHtml = '';
    if (productInfo.glovoUrl && productInfo.glovoUrl.trim() !== '') {
        glovoButtonHtml = `
            <a href="${productInfo.glovoUrl}" target="_blank" class="glovo-link-button">
                Ver en Portal Glovo
            </a>
        `;
    }
    
    // Generar el HTML para la vista de dos QR
    let html = `
        <div style="padding: 12px;">
            <!-- Imagen del producto -->
            ${imageHtml}
            
            <!-- Título del producto -->
            <div style="text-align: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.4rem; font-weight: 800; margin: 0; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: -0.02em;">
                    ${productInfo.name || 'Producto Escaneado'}
                </h2>
                ${providerHtml}
            </div>
            
            <!-- Tarjeta de información del producto -->
            <div style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.6) 100%); border-radius: var(--border-radius); padding: 16px; margin-bottom: 20px; border: 1px solid rgba(59, 130, 246, 0.2); backdrop-filter: var(--blur-backdrop); box-shadow: var(--shadow-lg);">
                
                <!-- SKU -->
                <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 12px; padding: 8px; background: rgba(59, 130, 246, 0.1); border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.3);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 0.875rem; color: var(--text-secondary); font-weight: 600;">SKU:</span>
                        <span style="font-size: 1rem; color: #60a5fa; font-weight: 700; font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;">${productInfo.sku || 'N/A'}</span>
                    </div>
                </div>
                
                <!-- Código de barras - SOLO EL PRIMERO -->
                <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 12px; padding: 8px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.3);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 0.875rem; color: var(--text-secondary); font-weight: 600;">Código:</span>
                        <span style="font-size: 1rem; color: #34d399; font-weight: 700; font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;">${barcode || 'N/A'}</span>
                    </div>
                </div>
                
                <!-- Ubicación -->
                <div style="display: flex; align-items: center; justify-content: center; padding: 8px; background: rgba(245, 158, 11, 0.1); border-radius: 8px; border: 1px solid rgba(245, 158, 11, 0.3);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 0.875rem; color: var(--text-secondary); font-weight: 600;">Ubicación:</span>
                        <span style="font-size: 1rem; color: #fbbf24; font-weight: 700; font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;">${location || 'N/A'}</span>
                    </div>
                </div>
            </div>
            
            ${glovoButtonHtml}
            
            <!-- Contenedor de QR codes -->
            <div style="display: flex; flex-direction: column; gap: 24px; margin-top: 20px;">
                
                <!-- QR del Producto -->
                <div style="text-align: center;">
                    <div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%); border-radius: var(--border-radius); padding: 12px; border: 1px solid rgba(59, 130, 246, 0.3); backdrop-filter: var(--blur-backdrop);">
                        <h4 style="color: #60a5fa; font-weight: 600; font-size: 0.9rem; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em;">Código del Producto</h4>
                        <div style="background: white; border-radius: 8px; padding: 8px; display: inline-block; box-shadow: var(--shadow-md);">
                            <div id="product-qr" style="display: inline-block;"></div>
                        </div>
                        <div id="product-qr-text" style="margin-top: 8px; color: #94a3b8; font-size: 0.75rem; font-weight: 500; font-family: 'SF Mono', Monaco, monospace; word-break: break-all;">${barcode || ''}</div>
                    </div>
                </div>
                
                <!-- QR de la Ubicación -->
                <div style="text-align: center;">
                    <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.1) 100%); border-radius: var(--border-radius); padding: 12px; border: 1px solid rgba(245, 158, 11, 0.3); backdrop-filter: var(--blur-backdrop);">
                        <h4 style="color: #fbbf24; font-weight: 600; font-size: 0.9rem; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em;">Ubicación</h4>
                        <div style="background: white; border-radius: 8px; padding: 8px; display: inline-block; box-shadow: var(--shadow-md);">
                            <div id="location-qr" style="display: inline-block;"></div>
                        </div>
                        <div id="location-qr-text" style="margin-top: 8px; color: #94a3b8; font-size: 0.75rem; font-weight: 500; font-family: 'SF Mono', Monaco, monospace; word-break: break-all;">${location || ''}</div>
                    </div>
                </div>
            </div>
            
        </div>`;
    
    // Insertar el HTML en el contenedor
    scannerContainer.innerHTML = html;
    
    // Generar QR del producto de forma asíncrona - SOLO PRIMER CÓDIGO
    if (barcode) {
        setTimeout(() => {
            const size = window.innerWidth < 480 ? 160 : 180;
            new QRCode(document.getElementById('product-qr'), {
                text: barcode,
                width: size,
                height: size,
                colorDark: "#000000",
                colorLight: "#FFFFFF",
                correctLevel: QRCode.CorrectLevel.H
            });
        }, 100);
    }
    
    // Generar QR de la ubicación de forma asíncrona
    if (location) {
        setTimeout(() => {
            const size = window.innerWidth < 480 ? 160 : 180;
            new QRCode(document.getElementById('location-qr'), {
                text: location,
                width: size,
                height: size,
                colorDark: "#000000",
                colorLight: "#FFFFFF",
                correctLevel: QRCode.CorrectLevel.H
            });
        }, 100);
    }
    
    // Guardar el producto actual en una variable global
    window.currentProduct = productInfo;
}

// Función para generar QR
function generateQR() {
    try {
        const value1 = document.getElementById('firstSelect').value;
        const value2 = document.getElementById('secondSelect').value;
        const value3 = document.getElementById('thirdSelect').value;
        const combinedValue = `${value1}-${value2}-${value3}`;
        
        if (qr) {
            qr.clear();
            document.getElementById('qrcode').innerHTML = '';
        }
        
        const size = window.innerWidth < 480 ? 120 : 120;
        
        qr = new QRCode(document.getElementById('qrcode'), {
            text: combinedValue,
            width: size,
            height: size,
            colorDark: "#000000",
            colorLight: "#FFFFFF",
            correctLevel: QRCode.CorrectLevel.H
        });

        document.getElementById('qr-text').textContent = combinedValue;
        
        console.log('QR generado correctamente con valor:', combinedValue);
    } catch (error) {
        console.error('Error al generar QR:', error);
    }
}

// Función para limpiar todo
function clearAll() {
    if (qr) {
        qr.clear();
        document.getElementById('qrcode').innerHTML = '';
    }
    
    document.getElementById('qr-text').textContent = '';
    
    if (countdown) {
        clearInterval(countdown);
        countdown = null;
    }
    
    // Restablecer al producto predeterminado
    lastScannedProduct = {...DEFAULT_PRODUCT};
    
    // Mostrar vista con dos QR del producto predeterminado
    showProductAndLocationQr(lastScannedProduct);
}

// Función para limpiar el scanner
function clearScanner() {
    const scannerContainer = document.getElementById('scanner-container');
    const mainQrContainer = document.querySelector('.qr-container');
    const countdownElement = document.getElementById('countdown');
    
    scannerContainer.innerHTML = '';
    
    if (mainQrContainer) {
        mainQrContainer.style.display = 'none';
    }
    
    if (countdownElement) {
        countdownElement.style.display = 'none';
    }
    
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    // Siempre mostrar el producto predeterminado al limpiar
    lastScannedProduct = {...DEFAULT_PRODUCT};
    showProductAndLocationQr(lastScannedProduct);
}

// Función para mostrar productos guardados
// Función para mostrar productos guardados - VERSIÓN MEJORADA CON TABLA
function showSavedProducts() {
    const scannerContainer = document.getElementById('scanner-container');
    
    // Detener la cámara si está activa
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    // Limpiar referencia del último producto escaneado
    lastScannedProduct = null;
    
    // Si no hay productos guardados, mostrar un mensaje
    if (!scannedProducts || scannedProducts.length === 0) {
        scannerContainer.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <h3 style="color: var(--text-secondary); margin-bottom: 16px;">No hay productos guardados</h3>
                <button onclick="clearScanner()" class="modal-button danger">
                    Volver
                </button>
            </div>`;
        return;
    }
    
    // Crear la tabla de productos mejorada
    let productsHtml = `
<div style="padding: 10px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 10px;">
        <h3>Productos (${scannedProducts.length})</h3>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button onclick="cleanDuplicates()" class="table-action-button view" style="background-color: #2196f3; font-size: 0.85rem;">
                Limpiar Duplicados
            </button>
            <button onclick="exportProductsAsJson()" class="table-action-button delete" style="background-color: #ff9800; font-size: 0.85rem;">
                Exportar JSON
            </button>
        </div>
    </div>
    
    <div class="products-table-container">
        <table class="products-table">
            <thead>
                <tr>
                    <th>Img</th>
                    <th>Producto</th>
                    <th>SKU</th>
                    <th>Barcode</th>
                    <th>Ubicación</th>
                    <th>Proveedor</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>`;
    
    // Añadir cada producto a la tabla
    scannedProducts.forEach((product, index) => {
        const imageCell = product.imageUrl 
            ? `<img src="${product.imageUrl}" alt="${product.name}" class="product-thumbnail" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'40\\' height=\\'40\\'%3E%3Crect fill=\\'%23333\\' width=\\'40\\' height=\\'40\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' fill=\\'%23666\\' font-size=\\'20\\'%3E📦%3C/text%3E%3C/svg%3E'">` 
            : `<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:rgba(59,130,246,0.1);border-radius:6px;font-size:20px;">📦</div>`;
        
        const barcodeText = product.barcode || (product.barcodes && product.barcodes[0]) || 'N/A';
        const providerText = product.provider || '-';
        
        productsHtml += `
    <tr>
        <td>${imageCell}</td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${product.name || 'N/A'}</td>
        <td style="font-family: monospace; font-size: 0.85rem;">${product.sku || 'N/A'}</td>
        <td style="font-family: monospace; font-size: 0.85rem;">${barcodeText}</td>
        <td style="font-family: monospace; font-size: 0.85rem;">${product.location || 'N/A'}</td>
        <td class="provider-cell">${providerText}</td>
        <td class="actions-cell">
            <button onclick="viewProductDetails(${index})" class="table-action-button view" title="Ver detalles">
                👁️
            </button>
            ${product.glovoUrl ? `<a href="${product.glovoUrl}" target="_blank" class="table-action-button" style="background: linear-gradient(135deg, #ffc244, #ff9000); text-decoration: none; display: inline-flex; align-items: center; justify-content: center;" title="Ver en Glovo">🔗</a>` : ''}
            <button onclick="deleteProduct(${index})" class="table-action-button delete" title="Eliminar">
                🗑️
            </button>
        </td>
    </tr>`;
    });
    
    productsHtml += `
            </tbody>
        </table>
    </div>
    
    <button onclick="clearScanner()" class="modal-button danger" style="margin-top: 15px;">
        Volver
    </button>
</div>`;
    
    // Insertar el HTML en el contenedor
    scannerContainer.innerHTML = productsHtml;
}

// Función para ver detalles de un producto
function viewProductDetails(index) {
    const product = scannedProducts[index];
    if (!product) return;
    
    lastScannedProduct = product;
    showProductAndLocationQr(product);
}

// Función para eliminar un producto
function deleteProduct(index) {
    if (confirm('¿Estás seguro de que quieres eliminar este producto?')) {
        scannedProducts.splice(index, 1);
        saveProducts();
        showSavedProducts();
    }
}

// Función para importar productos desde un archivo JSON
function importProductsFromJson(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const content = e.target.result;
            const products = JSON.parse(content);
            
            if (!Array.isArray(products)) {
                throw new Error('El formato del archivo no es válido. Se esperaba un array de productos.');
            }

            // Convertir productos del nuevo formato al formato interno
            const normalizedProducts = products.map(product => ({
                name: product["Nombre del Producto"] || "Sin nombre",
                sku: product["SKU"] || "",
                barcode: String(product["Barcodes"] || ""),
                barcodes: [String(product["Barcodes"] || "")],
                location: product["Location"] || null,
                imageUrl: product["URL de Imagen"] || null,
                provider: product["Proveedor"] || "",
                glovoUrl: product["URL Datos Con Codigo de barras"] || null,
                timestamp: new Date().toISOString()
            }));
const validProducts = normalizedProducts.filter(p => 
                p && (p.name || p.barcode || (p.barcodes && p.barcodes.length > 0))
            );

            if (validProducts.length === 0) {
                throw new Error('No se encontraron productos válidos en el archivo.');
            }

            scannedProducts = scannedProducts.concat(validProducts);
            scannedProducts = removeDuplicateProducts();
            saveProducts();
            
            showNotification(`Se han importado ${validProducts.length} productos. Duplicados eliminados automáticamente.`, 'success');
            showSavedProducts();
            
        } catch (error) {
            console.error('Error al importar productos:', error);
            showNotification('Error al importar productos: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    
    event.target.value = '';
}
// Función para procesar el texto OCR y extraer información del producto
// Función para procesar el texto OCR y extraer información del producto
// Función para procesar el texto OCR y extraer información del producto
function processProductInfo(ocrText) {
    if (!ocrText) return null;
    
    // Normalizar el texto preservando la estructura
    const cleanText = ocrText
        .replace(/[\r\n]+/g, '\n')    // Normalizar saltos de línea
        .replace(/\s+/g, ' ')          // Normalizar espacios en cada línea
        .trim();
    
    console.log('Texto OCR original:', ocrText);
    console.log('Texto OCR limpio:', cleanText);
    
    const productInfo = {
        name: "",
        sku: "",
        barcodes: [],
        fullText: cleanText,
        timestamp: new Date().toISOString()
    };
    
    // ===== EXTRAER SKU (siempre después de "SKU:") =====
    const skuRegex = /SKU\s*:\s*([A-Z0-9]+)/gi;
    const skuMatch = cleanText.match(skuRegex);
    
    if (skuMatch && skuMatch[0]) {
        // Extraer solo el valor después de "SKU:"
        const skuValue = skuMatch[0].replace(/SKU\s*:\s*/gi, '').trim();
        productInfo.sku = skuValue;
        console.log('SKU encontrado:', productInfo.sku);
    } else {
        console.log('No se encontró SKU con formato "SKU:"');
    }
    
    // ===== EXTRAER CÓDIGO DE BARRAS (después de "Códigos de barras:" o "Codigos de Barras:") =====
    const barcodeRegex = /C[óo]digos?\s+de\s+barras\s*:\s*(\d{8,14})/gi;
    const barcodeMatches = [...cleanText.matchAll(barcodeRegex)];
    
    if (barcodeMatches.length > 0) {
        productInfo.barcodes = barcodeMatches.map(match => match[1].trim());
        productInfo.barcode = productInfo.barcodes[0];
        console.log('Códigos de barras encontrados:', productInfo.barcodes);
    } else {
        // Fallback: buscar cualquier secuencia de 8-14 dígitos
        const fallbackBarcodeRegex = /\b(\d{8,14})\b/g;
        const fallbackMatches = [...cleanText.matchAll(fallbackBarcodeRegex)];
        
        if (fallbackMatches.length > 0) {
            // Filtrar códigos válidos
            const validBarcodes = fallbackMatches
                .map(match => match[1])
                .filter(code => {
                    if (/0{5,}/.test(code)) return false;
                    if (/^(\d)\1+$/.test(code)) return false;
                    return true;
                });
            
            productInfo.barcodes = [...new Set(validBarcodes)];
            productInfo.barcode = productInfo.barcodes[0] || '';
            console.log('Códigos de barras (fallback):', productInfo.barcodes);
        }
    }
    
    // ===== EXTRAER NOMBRE (todo el texto ANTES de "SKU:") =====
    let productName = '';
    
    // Buscar la posición de "SKU:"
    const skuPosition = cleanText.search(/SKU\s*:/gi);
    
    if (skuPosition > 0) {
        // El nombre es todo lo que está antes de "SKU:"
        productName = cleanText.substring(0, skuPosition).trim();
        console.log('Nombre extraído antes de SKU:', productName);
    } else {
        // Si no hay "SKU:", buscar antes de "Códigos de barras:"
        const barcodePosition = cleanText.search(/C[óo]digos?\s+de\s+barras\s*:/gi);
        
        if (barcodePosition > 0) {
            productName = cleanText.substring(0, barcodePosition).trim();
            console.log('Nombre extraído antes de Códigos de barras:', productName);
        } else {
            // Última opción: usar la primera línea o segmento
            const firstLine = cleanText.split(/[\n|]/)[0];
            productName = firstLine.trim();
            console.log('Nombre extraído de primera línea:', productName);
        }
    }
    
    // Limpiar el nombre de elementos no deseados
    productName = productName
        .replace(/\n/g, ' ')           // Reemplazar saltos de línea por espacios
        .replace(/\|/g, ' ')           // Reemplazar separadores
        .replace(/\s+/g, ' ')          // Normalizar espacios múltiples
        .trim();
    
    // Remover palabras clave residuales si aparecen
    const cleanupPatterns = [
        /SKU\s*:?\s*/gi,
        /C[óo]digos?\s+de\s+barras\s*:?\s*/gi,
        /Código\s*:?\s*/gi,
        /Codigo\s*:?\s*/gi
    ];
    
    for (const pattern of cleanupPatterns) {
        productName = productName.replace(pattern, '').trim();
    }
    
    // Remover códigos de barras si aparecen en el nombre
    for (const barcode of productInfo.barcodes) {
        productName = productName.replace(barcode, '').trim();
    }
    
    // Remover SKU si aparece en el nombre
    if (productInfo.sku) {
        productName = productName.replace(productInfo.sku, '').trim();
    }
    
    // Limpiar espacios finales
    productName = productName
        .replace(/\s+/g, ' ')
        .replace(/^[:\s\-|]+/, '')
        .replace(/[:\s\-|]+$/, '')
        .trim();
    
    // Limitar longitud
    if (productName.length > 100) {
        productName = productName.substring(0, 100).trim() + '...';
    }
    
    // Validar que tengamos un nombre válido
    if (productName.length < 2) {
        productName = 'Producto sin nombre';
    }
    
    productInfo.name = productName;
    
    console.log('===== RESULTADO FINAL =====');
    console.log('Nombre:', productInfo.name);
    console.log('SKU:', productInfo.sku);
    console.log('Códigos de barras:', productInfo.barcodes);
    console.log('===========================');
    
    return productInfo;
}

// Función para verificar productos existentes por cualquiera de sus códigos
function findProductByAnyBarcode(barcode) {
    return scannedProducts.findIndex(product => 
        (product.barcode && product.barcode === barcode) || 
        (Array.isArray(product.barcodes) && product.barcodes.includes(barcode))
    );
}

// Función mejorada para guardar productos
// Función mejorada para guardar productos - VERSIÓN ACTUALIZADA
function saveProductWithBarcode(productInfo) {
    if (!productInfo) return;
    
    console.log('Guardando producto:', productInfo);
    
    const normalizedProduct = {
        name: productInfo.name || "Producto sin nombre",
        sku: productInfo.sku || "",
        barcodes: productInfo.barcodes || [],
        barcode: productInfo.barcode || (productInfo.barcodes && productInfo.barcodes.length > 0 ? productInfo.barcodes[0] : ""),
        location: productInfo.location || null,
        imageUrl: productInfo.imageUrl || null,
        provider: productInfo.provider || "",
        glovoUrl: productInfo.glovoUrl || null,
        fullText: productInfo.fullText || "",
        timestamp: productInfo.timestamp || new Date().toISOString()
    };
    
    if (!normalizedProduct.barcodes || normalizedProduct.barcodes.length === 0) {
        if (normalizedProduct.barcode) {
            normalizedProduct.barcodes = [normalizedProduct.barcode];
        } else {
            const existingBySku = normalizedProduct.sku ? 
                scannedProducts.findIndex(p => p.sku && p.sku.toLowerCase() === normalizedProduct.sku.toLowerCase()) : -1;
            const existingByName = normalizedProduct.name ? 
                scannedProducts.findIndex(p => p.name && p.name.toLowerCase().trim() === normalizedProduct.name.toLowerCase().trim()) : -1;
            
            if (existingBySku >= 0) {
                scannedProducts[existingBySku] = { ...scannedProducts[existingBySku], ...normalizedProduct };
                console.log('Producto actualizado por SKU:', normalizedProduct.sku);
            } else if (existingByName >= 0) {
                scannedProducts[existingByName] = { ...scannedProducts[existingByName], ...normalizedProduct };
                console.log('Producto actualizado por nombre:', normalizedProduct.name);
            } else {
                scannedProducts.push(normalizedProduct);
                console.log('Nuevo producto agregado:', normalizedProduct.name);
            }
            saveProducts();
            return;
        }
    }
    
    let updated = false;
    
    for (const barcode of normalizedProduct.barcodes) {
        const existingIndex = findProductByAnyBarcode(barcode);
        
        if (existingIndex >= 0) {
            const existingProduct = scannedProducts[existingIndex];
            
            const existingBarcodes = Array.isArray(existingProduct.barcodes) 
                ? existingProduct.barcodes 
                : existingProduct.barcode ? [existingProduct.barcode] : [];
            
            const allBarcodes = [...new Set([
                ...existingBarcodes,
                ...normalizedProduct.barcodes
            ])];
            
            scannedProducts[existingIndex] = {
                ...existingProduct,
                ...normalizedProduct,
                barcodes: allBarcodes,
                barcode: allBarcodes[0]
            };
            
            updated = true;
            console.log('Producto actualizado con código:', barcode);
            break;
        }
    }
    
    if (!updated) {
        scannedProducts.push(normalizedProduct);
        console.log('Nuevo producto agregado:', normalizedProduct.name);
    }
    
    saveProducts();
}

// Función para verificar permisos de cámara
async function checkCameraPermissions() {
    try {
        const result = await navigator.permissions.query({ name: 'camera' });
        if (result.state === 'granted') return true;
        if (result.state === 'prompt') return true;
        
        alert('Necesitamos acceso a la cámara para escanear códigos. Por favor, habilita los permisos en la configuración de tu navegador.');
        return false;
    } catch (error) {
        console.error('Error al verificar permisos:', error);
        return true;
    }
}

// Inicializar Tesseract Worker
async function initTesseract() {
    worker = await Tesseract.createWorker('eng');
    console.log('Tesseract inicializado');
}

// Función para procesar imagen con OCR.space
async function processWithOCRSpace(canvas) {
    try {
        const optimizedBlob = await new Promise(resolve => {
            canvas.toBlob(resolve, 'image/jpeg', 0.9);
        });
        
        const formData = new FormData();
        formData.append('file', optimizedBlob, 'imagen.jpg');
        formData.append('OCREngine', '2');
        formData.append('scale', 'true');
        formData.append('detectOrientation', 'true');
        
        const response = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            headers: { 'apikey': OCR_API_KEY },
            body: formData
        });

        if (!response.ok) {
            throw new Error('Error en la respuesta de OCR.space');
        }

        const result = await response.json();
        
        if (result.IsErroredOnProcessing) {
            throw new Error(result.ErrorMessage || 'Error procesando la imagen en OCR.space');
        }

        if (!result.ParsedResults || result.ParsedResults.length === 0) {
            throw new Error('No se encontró texto en la imagen');
        }

        return result.ParsedResults[0].ParsedText;
    } catch (error) {
        console.error('Error en OCR.space:', error);
        throw error;
    }
}

// Función para procesar imagen con Tesseract (fallback)
async function processWithTesseract(canvas) {
    try {
        if (!worker) {
            await initTesseract();
        }
        const result = await worker.recognize(canvas);
        return result.data.text;
    } catch (error) {
        console.error('Error en Tesseract:', error);
        throw error;
    }
}

// Función para iniciar la cámara con marco de recorte
async function startCamera() {
    if (!await checkCameraPermissions()) return;
    
    const scannerContainer = document.getElementById('scanner-container');
    scannerContainer.innerHTML = '';
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });
        
        cameraStream = stream;
        
        const video = document.createElement('video');
        video.id = 'camera-preview';
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.style.width = '100%';
        video.style.display = 'block';
        scannerContainer.appendChild(video);
        
        video.addEventListener('loadedmetadata', () => {
            const canvas = document.createElement('canvas');
            canvas.id = 'canvas';
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.style.display = 'none';
            scannerContainer.appendChild(canvas);
            const ctx = canvas.getContext('2d');
            
            const cropFrame = document.createElement('div');
            cropFrame.className = 'crop-frame';
            cropFrame.id = 'crop-frame';
            cropFrame.style.left = `${cropperSettings.x}%`;
            cropFrame.style.top = `${cropperSettings.y}%`;
            cropFrame.style.width = `${cropperSettings.width}%`;
            cropFrame.style.height = `${cropperSettings.height}%`;
            
            const resizer = document.createElement('div');
            resizer.className = 'resizer';
            cropFrame.appendChild(resizer);
            
            scannerContainer.appendChild(cropFrame);
            
            let isDragging = false;
            let isResizing = false;
            let startX, startY, startLeft, startTop, startWidth, startHeight;
            
            cropFrame.addEventListener('mousedown', (e) => {
                if (e.target === resizer) return;
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                startLeft = cropFrame.offsetLeft;
                startTop = cropFrame.offsetTop;
                e.preventDefault();
            });
            
            resizer.addEventListener('mousedown', (e) => {
                isResizing = true;
                startX = e.clientX;
                startY = e.clientY;
                startWidth = cropFrame.offsetWidth;
                startHeight = cropFrame.offsetHeight;
                e.stopPropagation();
                e.preventDefault();
            });
            
            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    
                    const newLeft = startLeft + dx;
                    const newTop = startTop + dy;
                    
                    const videoRect = video.getBoundingClientRect();
                    const maxX = videoRect.width - cropFrame.offsetWidth;
                    const maxY = videoRect.height - cropFrame.offsetHeight;
                    
                    const clampedLeft = Math.max(0, Math.min(newLeft, maxX));
                    const clampedTop = Math.max(0, Math.min(newTop, maxY));
                    
                    cropFrame.style.left = `${clampedLeft}px`;
                    cropFrame.style.top = `${clampedTop}px`;
                    
                    cropperSettings.x = (clampedLeft / videoRect.width) * 100;
                    cropperSettings.y = (clampedTop / videoRect.height) * 100;
                    
                } else if (isResizing) {
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    
                    const newWidth = Math.max(50, startWidth + dx);
                    const newHeight = Math.max(30, startHeight + dy);
                    
                    const videoRect = video.getBoundingClientRect();
                    const maxWidth = videoRect.width - cropFrame.offsetLeft;
                    const maxHeight = videoRect.height - cropFrame.offsetTop;
                    
                    const clampedWidth = Math.min(newWidth, maxWidth);
                    const clampedHeight = Math.min(newHeight, maxHeight);
                    
                    cropFrame.style.width = `${clampedWidth}px`;
                    cropFrame.style.height = `${clampedHeight}px`;
                    
                    cropperSettings.width = (clampedWidth / videoRect.width) * 100;
                    cropperSettings.height = (clampedHeight / videoRect.height) * 100;
                }
            });
            
            document.addEventListener('mouseup', () => {
                isDragging = false;
                isResizing = false;
            });
            
            cropFrame.addEventListener('touchstart', (e) => {
                if (e.target === resizer) return;
                isDragging = true;
                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
                startLeft = cropFrame.offsetLeft;
                startTop = cropFrame.offsetTop;
                e.preventDefault();
            });
            
            resizer.addEventListener('touchstart', (e) => {
                isResizing = true;
                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
                startWidth = cropFrame.offsetWidth;
                startHeight = cropFrame.offsetHeight;
                e.stopPropagation();
                e.preventDefault();
            });
            
            document.addEventListener('touchmove', (e) => {
                if (isDragging) {
                    const touch = e.touches[0];
                    const dx = touch.clientX - startX;
                    const dy = touch.clientY - startY;
                    
                    const newLeft = startLeft + dx;
                    const newTop = startTop + dy;
                    
                    const videoRect = video.getBoundingClientRect();
                    const maxX = videoRect.width - cropFrame.offsetWidth;
                    const maxY = videoRect.height - cropFrame.offsetTop;
                    
                    const clampedLeft = Math.max(0, Math.min(newLeft, maxX));
                    const clampedTop = Math.max(0, Math.min(newTop, maxY));
                    
                    cropFrame.style.left = `${clampedLeft}px`;
                    cropFrame.style.top = `${clampedTop}px`;
                    
                    cropperSettings.x = (clampedLeft / videoRect.width) * 100;
                    cropperSettings.y = (clampedTop / videoRect.height) * 100;
                    
                } else if (isResizing) {
                    const touch = e.touches[0];
                    const dx = touch.clientX - startX;
                    const dy = touch.clientY - startY;
                    
                    const newWidth = Math.max(50, startWidth + dx);
                    const newHeight = Math.max(30, startHeight + dy);
                    
                    const videoRect = video.getBoundingClientRect();
                    const maxWidth = videoRect.width - cropFrame.offsetLeft;
                    const maxHeight = videoRect.height - cropFrame.offsetTop;
                    
                    const clampedWidth = Math.min(newWidth, maxWidth);
                    const clampedHeight = Math.min(newHeight, maxHeight);
                    
                    cropFrame.style.width = `${clampedWidth}px`;
                    cropFrame.style.height = `${clampedHeight}px`;
                    
                    cropperSettings.width = (clampedWidth / videoRect.width) * 100;
                    cropperSettings.height = (clampedHeight / videoRect.height) * 100;
                }
            });
            
            document.addEventListener('touchend', () => {
                isDragging = false;
                isResizing = false;
            });
            
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'crop-controls';
            controlsDiv.style.marginTop = '10px';
            controlsDiv.style.display = 'flex';
            controlsDiv.style.gap = '10px';
            
            const captureButton = document.createElement('button');
            captureButton.textContent = 'Capturar Imagen';
            captureButton.className = 'button';
            
            captureButton.addEventListener('click', async () => {
                showNotification('Procesando imagen...', 'info');
                
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                const videoRect = video.getBoundingClientRect();
                const scaleX = canvas.width / videoRect.width;
                const scaleY = canvas.height / videoRect.height;
                
                const cropX = cropFrame.offsetLeft * scaleX;
                const cropY = cropFrame.offsetTop * scaleY;
                const cropWidth = cropFrame.offsetWidth * scaleX;
                const cropHeight = cropFrame.offsetHeight * scaleY;
                
                const croppedCanvas = document.createElement('canvas');
                croppedCanvas.width = cropWidth;
                croppedCanvas.height = cropHeight;
                const croppedCtx = croppedCanvas.getContext('2d');
                
                croppedCtx.drawImage(
                    canvas,
                    cropX, cropY, cropWidth, cropHeight,
                    0, 0, cropWidth, cropHeight
                );
                
                try {
                    let ocrText;
                    try {
                        ocrText = await processWithOCRSpace(croppedCanvas);
                    } catch (error) {
                        console.log('OCR.space falló, intentando con Tesseract');
                        ocrText = await processWithTesseract(croppedCanvas);
                    }
                    
                    if (!ocrText || ocrText.trim().length === 0) {
                        throw new Error('No se detectó texto en la imagen');
                    }
                    
                    const productInfo = processProductInfo(ocrText);
                    
                    if (!productInfo || (!productInfo.barcodes.length && !productInfo.sku)) {
                        throw new Error('No se detectó información de producto válida');
                    }
                    
                    const currentLocation = getCurrentLocation();
                    if (currentLocation) {
                        productInfo.location = currentLocation;
                    }
                    
                    saveProductWithBarcode(productInfo);
                    lastScannedProduct = productInfo;
                    
                    if (cameraStream) {
                        cameraStream.getTracks().forEach(track => track.stop());
                        cameraStream = null;
                    }
                    
                    showProductAndLocationQr(productInfo);
                    showNotification(`✓ Producto escaneado: ${productInfo.name}`, 'success');
                    
                } catch (error) {
                    console.error('Error procesando imagen:', error);
                    showNotification(`Error: ${error.message}`, 'error');
                }
            });
            
            const closeButton = document.createElement('button');
            closeButton.textContent = 'Cerrar';
            closeButton.className = 'button clear-btn';
            closeButton.addEventListener('click', () => {
                if (cameraStream) {
                    cameraStream.getTracks().forEach(track => track.stop());
                    cameraStream = null;
                }
                clearScanner();
            });
            
            controlsDiv.appendChild(captureButton);
            controlsDiv.appendChild(closeButton);
            scannerContainer.appendChild(controlsDiv);
        });
        
    } catch (error) {
        console.error('Error al iniciar la cámara:', error);
        showNotification('No se pudo acceder a la cámara', 'error');
    }
}

// Función para exportar productos como JSON
// Función para exportar productos como JSON - VERSIÓN MEJORADA
function exportProductsAsJson() {
    try {
        // Convertir productos del formato interno al formato de exportación
        const exportProducts = scannedProducts.map(product => ({
            "Nombre del Producto": product.name || "",
            "SKU": product.sku || "",
            "URL de Imagen": product.imageUrl || "",
            "Barcodes": product.barcode || (product.barcodes && product.barcodes[0]) || "",
            "Location": product.location || null,
            "Proveedor": product.provider || "",
            "URL Datos Con Codigo de barras": product.glovoUrl || ""
        }));
        
        const dataStr = JSON.stringify(exportProducts, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `productos_${new Date().toISOString().slice(0,10)}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        showNotification('Productos exportados correctamente', 'success');
    } catch (error) {
        console.error('Error al exportar productos:', error);
        showNotification('Error al exportar productos', 'error');
    }
}

// Función para asociar el producto actual con la ubicación
function associateCurrentProduct() {
    if (window.currentProduct) {
        const location = getCurrentLocation();
        if (location) {
            window.currentProduct.location = location;
            associateProductWithLocation(window.currentProduct);
            showNotification(`✓ Ubicación ${location} asociada correctamente`, 'success');
            showProductAndLocationQr(window.currentProduct);
        }
    }
}

// Variables para el reconocimiento de voz
let recognition = null;
let isListening = false;

// Función para convertir números en palabras a dígitos
function convertSpokenNumbersToDigits(text) {
    const numberMap = {
        'cero': '0', 'uno': '1', 'dos': '2', 'tres': '3', 'cuatro': '4',
        'cinco': '5', 'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9',
        // Variaciones comunes
        'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
        'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9'
    };
    
    let result = text.toLowerCase();
    
    // Reemplazar números escritos por dígitos
    Object.keys(numberMap).forEach(word => {
        const regex = new RegExp('\\b' + word + '\\b', 'g');
        result = result.replace(regex, numberMap[word]);
    });
    
    return result;
}
// Función para limpiar y normalizar el query de búsqueda
function normalizeSearchQuery(query) {
    // Convertir números hablados a dígitos
    let normalized = convertSpokenNumbersToDigits(query);
    
    // Remover todos los espacios
    normalized = normalized.replace(/\s+/g, '');
    
    // Remover caracteres especiales excepto letras y números
    normalized = normalized.replace(/[^a-zA-Z0-9]/g, '');
    
    return {
        original: query,
        normalized: normalized,
        withSpaces: query.toLowerCase().trim()
    };
}
// Función para seleccionar un resultado de búsqueda por voz
function selectVoiceResult(index) {
    const product = scannedProducts[index];
    if (product) {
        lastScannedProduct = product;
        showProductAndLocationQr(product);
        showNotification(`Producto seleccionado: ${product.name || product.sku}`, 'success');
    }
}


// Función para alternar la búsqueda por voz
// Función para alternar la búsqueda por voz
function toggleVoiceSearch() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showNotification('Tu navegador no soporta el reconocimiento de voz. Prueba con Chrome o Edge.', 'error');
        return;
    }

    if (isListening) {
        if (recognition) {
            recognition.stop();
        }
        isListening = false;
        document.getElementById('voice-search-button').classList.remove('listening');
        return;
    }

    try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'es-ES';
        
        recognition.onstart = function() {
            isListening = true;
            document.getElementById('voice-search-button').classList.add('listening');
            showNotification('🎤 Escuchando... Di el nombre, SKU o últimos 6 dígitos del código', 'info');
        };
        
        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript.trim();
            console.log('Transcripción recibida:', transcript);
            searchProductByVoice(transcript);
        };
        
        recognition.onerror = function(event) {
            console.error('Error en reconocimiento de voz:', event.error);
            let errorMessage = 'Error en el reconocimiento de voz';
            
            switch(event.error) {
                case 'no-speech':
                    errorMessage = 'No se detectó ningún discurso. Inténtalo de nuevo.';
                    break;
                case 'audio-capture':
                    errorMessage = 'No se pudo capturar el audio. Verifica el micrófono.';
                    break;
                case 'not-allowed':
                    errorMessage = 'Permiso de micrófono denegado. Habilita los permisos en tu navegador.';
                    break;
                case 'network':
                    errorMessage = 'Error de red. Verifica tu conexión.';
                    break;
            }
            
            showNotification(errorMessage, 'error');
            isListening = false;
            document.getElementById('voice-search-button').classList.remove('listening');
        };
        
        recognition.onend = function() {
            isListening = false;
            document.getElementById('voice-search-button').classList.remove('listening');
        };
        
        recognition.start();
        
    } catch (error) {
        console.error('Error al inicializar el reconocimiento de voz:', error);
        showNotification('Error al inicializar el reconocimiento de voz', 'error');
    }
}

// Función para buscar producto por voz
// Función para buscar producto por voz (versión mejorada)
function searchProductByVoice(query) {
    const scannerContainer = document.getElementById('scanner-container');
    
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    // Primero, eliminar duplicados de la lista actual
    scannedProducts = removeDuplicateProducts();
    saveProducts();
    
    // Normalizar el query de búsqueda
    const queryVariants = normalizeSearchQuery(query);
    const normalizedQuery = queryVariants.normalized.toLowerCase();
    const originalQuery = queryVariants.withSpaces;
    
    console.log('Query original:', query);
    console.log('Query normalizado:', normalizedQuery);
    console.log('Query con espacios:', originalQuery);
    
    // Detectar si el query normalizado es puramente numérico
    const isNumericQuery = /^\d+$/.test(normalizedQuery);
    const isLastSixDigits = /^\d{6}$/.test(normalizedQuery);
    
    // Filtrar productos que coincidan con la búsqueda
    const matches = scannedProducts.filter(product => {
        // Normalizar los datos del producto para comparación
        const productName = (product.name || '').toLowerCase();
        const productSku = (product.sku || '').replace(/\s+/g, '').toLowerCase();
        const productBarcode = (product.barcode || '').replace(/\s+/g, '');
        
        // 1. Búsqueda por nombre (permite espacios y es más flexible)
        const nameMatch = productName.includes(originalQuery);
        
        // 2. Búsqueda exacta por SKU normalizado (sin espacios)
        const skuMatch = productSku === normalizedQuery;
        
        // 3. Búsqueda por código de barras completo
        const fullBarcodeMatch = productBarcode.includes(normalizedQuery) ||
                                (product.barcodes && product.barcodes.some(barcode => 
                                    (barcode || '').replace(/\s+/g, '').includes(normalizedQuery)));
        
        // 4. Búsqueda por últimos 6 dígitos (solo si el query tiene exactamente 6 dígitos)
        let lastSixDigitsMatch = false;
        if (isLastSixDigits) {
            // Verificar en barcode principal
            if (productBarcode.length >= 6) {
                const lastSix = productBarcode.slice(-6);
                lastSixDigitsMatch = lastSix === normalizedQuery;
            }
            
            // Verificar en array de barcodes si no encontró match
            if (!lastSixDigitsMatch && product.barcodes) {
                lastSixDigitsMatch = product.barcodes.some(barcode => {
                    const cleanBarcode = (barcode || '').replace(/\s+/g, '');
                    if (cleanBarcode.length >= 6) {
                        const lastSix = cleanBarcode.slice(-6);
                        return lastSix === normalizedQuery;
                    }
                    return false;
                });
            }
        }
        
        // 5. Búsqueda parcial más flexible para códigos alfanuméricos
        const partialSkuMatch = productSku.includes(normalizedQuery) && normalizedQuery.length >= 3;
        
        return nameMatch || skuMatch || fullBarcodeMatch || lastSixDigitsMatch || partialSkuMatch;
    });
    
    // Determinar el tipo de búsqueda para mostrar en el mensaje
    let searchType = 'nombre';
    if (isLastSixDigits) {
        searchType = 'últimos 6 dígitos del código de barras';
    } else if (isNumericQuery) {
        searchType = 'código numérico';
    } else if (normalizedQuery.match(/^[a-zA-Z0-9]+$/)) {
        searchType = 'SKU/código';
    }
    
    if (matches.length === 0) {
        scannerContainer.innerHTML = `
            <div style="padding: 15px;">
                <h3 style="text-align: center; margin-bottom: 15px;">No se encontraron productos</h3>
                <div style="margin: 10px 0; padding: 10px; background: rgba(255,193,7,0.1); border-radius: var(--border-radius); border: 1px solid rgba(255,193,7,0.3);">
                    <p><strong>Búsqueda:</strong> "${query}"</p>
                    <p><strong>Interpretado como:</strong> "${normalizedQuery}" (${searchType})</p>
                </div>
                <div style="margin: 15px 0; padding: 12px; background: rgba(59, 130, 246, 0.1); border-radius: var(--border-radius); border: 1px solid rgba(59, 130, 246, 0.3); font-size: 0.9em;">
                    <strong>🔍 Tipos de búsqueda soportados:</strong><br>
                    • Por nombre del producto (ej: "tornillo")<br>
                    • Por SKU completo (ej: "ocho u tres e tres zeta" → 8U3E3Z)<br>
                    • Por código de barras completo<br>
                    • Por últimos 6 dígitos (ej: "uno dos tres cuatro cinco seis" → 123456)<br>
                    <br><strong>💡 Consejos:</strong><br>
                    • Dicta los números claramente: "cuatro dos cero" en lugar de "cuarenta y dos"<br>
                    • Para SKUs alfanuméricos: "ocho u tres" = "8U3"<br>
                    • Evita pausas largas entre caracteres
                </div>
                <button onclick="clearScanner()" class="modal-button danger">Volver</button>
            </div>`;
        showNotification(`No se encontraron productos. Query interpretado: ${normalizedQuery}`, 'warning');
    } else if (matches.length === 1) {
        // Un solo resultado - mostrar directamente
        lastScannedProduct = matches[0];
        showProductAndLocationQr(matches[0]);
        showNotification(`✓ Producto encontrado por ${searchType}: ${matches[0].name || matches[0].sku || 'N/A'}`, 'success');
    } else {
        // Múltiples resultados - mostrar lista para seleccionar
        let resultsHtml = `
            <div style="padding: 15px;">
                <h3 style="text-align: center; margin-bottom: 15px;">Resultados de búsqueda (${matches.length})</h3>
                <div style="margin: 10px 0; padding: 8px; background: rgba(33,150,243,0.1); border-radius: var(--border-radius); border: 1px solid rgba(33,150,243,0.3); font-size: 0.9em;">
                    <strong>Búsqueda:</strong> "${query}" → <strong>"${normalizedQuery}"</strong> (${searchType})
                </div>
                <div style="max-height: 400px; overflow-y: auto;">`;
        
        matches.forEach((product, index) => {
            // Determinar y resaltar por qué este producto coincidió
            let matchReason = '';
            const productSku = (product.sku || '').replace(/\s+/g, '').toLowerCase();
            const productBarcode = (product.barcode || '').replace(/\s+/g, '');
            
            if (productSku === normalizedQuery) {
                matchReason = `✓ SKU exacto: ${product.sku}`;
            } else if (isLastSixDigits && productBarcode.slice(-6) === normalizedQuery) {
                matchReason = `✓ Código termina en: ${normalizedQuery}`;
            } else if (productBarcode.includes(normalizedQuery)) {
                matchReason = `✓ Código de barras contiene: ${normalizedQuery}`;
            } else if (productSku.includes(normalizedQuery)) {
                matchReason = `✓ SKU contiene: ${normalizedQuery}`;
            } else if ((product.name || '').toLowerCase().includes(originalQuery)) {
                matchReason = `✓ Nombre contiene: ${originalQuery}`;
            }
            
            // Mostrar imagen si existe
            const productImage = product.imageUrl 
                ? `<img src="${product.imageUrl}" alt="${product.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; margin-right: 12px;" onerror="this.style.display='none'">`
                : '';
            
            resultsHtml += `
                <div style="margin: 10px 0; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--border-radius); background: rgba(0,0,0,0.3); display: flex; align-items: center; gap: 10px;">
                    ${productImage}
                    <div style="flex: 1;">
                        <div style="font-weight: bold; color: var(--text-color); margin-bottom: 4px;">${product.name || 'Sin nombre'}</div>
                        <div style="color: var(--text-secondary); font-size: 0.85rem;">SKU: ${product.sku || 'N/A'}</div>
                        <div style="color: var(--text-secondary); font-size: 0.85rem;">Ubicación: ${product.location || 'N/A'}</div>
                        ${product.provider ? `<div style="color: var(--text-secondary); font-size: 0.85rem;">Proveedor: ${product.provider}</div>` : ''}
                        ${matchReason ? `<div style="color: #60a5fa; font-size: 0.85rem; margin-top: 4px;">${matchReason}</div>` : ''}
                    </div>
                    <button class="table-action-button view" onclick="selectVoiceResult(${scannedProducts.indexOf(product)})" style="min-width: 80px;">
                        Seleccionar
                    </button>
                </div>`;
        });
        
        resultsHtml += `
                </div>
                <div style="margin-top: 15px; padding: 10px; background: rgba(245, 158, 11, 0.1); border-radius: var(--border-radius); border: 1px solid rgba(245, 158, 11, 0.3); font-size: 0.9em;">
                    <em>💡 Si no ves el producto esperado, intenta:</em><br>
                    • Dictar más despacio y claro<br>
                    • Para SKUs mixtos: "ocho u tres e tres zeta" (8U3E3Z)<br>
                    • Para códigos numéricos: "cuatro dos cero ocho ocho" (42088)
                </div>
                <button onclick="clearScanner()" class="modal-button danger" style="width: 100%; margin-top: 10px;">Volver</button>
            </div>`;
        
        scannerContainer.innerHTML = resultsHtml;
        showNotification(`Encontrados ${matches.length} productos para "${normalizedQuery}"`, 'info');
    }
}
// Función para mostrar resultados múltiples de búsqueda por voz
function showVoiceSearchResults(products, searchTerm) {
    const scannerContainer = document.getElementById('scanner-container');
    
    let html = `
        <div style="padding: 15px;">
            <h3 style="margin-top: 0; margin-bottom: 15px;">Se encontraron ${products.length} productos para "${searchTerm}":</h3>
            <div style="max-height: 400px; overflow-y: auto;">
    `;
    
    products.forEach((product, index) => {
        html += `
            <div style="background: rgba(30, 41, 59, 0.7); border-radius: 8px; padding: 12px; margin-bottom: 10px; border: 1px solid rgba(59, 130, 246, 0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h4 style="margin: 0; color: #60a5fa;">${product.name || 'Producto sin nombre'}</h4>
                        <p style="margin: 5px 0 0 0; color: #94a3b8; font-size: 0.9rem;">SKU: ${product.sku || 'N/A'}</p>
                    </div>
                    <button onclick="selectVoiceSearchResult(${index})" class="button" style="padding: 8px 12px; font-size: 0.9rem;">Seleccionar</button>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
            <button onclick="clearScanner()" class="button clear-btn" style="width: 100%; margin-top: 15px;">Cancelar</button>
        </div>
    `;
    
    scannerContainer.innerHTML = html;
    window.voiceSearchResults = products;
}

// Función para seleccionar un resultado de búsqueda por voz
function selectVoiceSearchResult(index) {
    if (window.voiceSearchResults && window.voiceSearchResults[index]) {
        const product = window.voiceSearchResults[index];
        lastScannedProduct = product;
        showProductAndLocationQr(product);
        showNotification(`Producto seleccionado: ${product.name || 'Producto'}`, 'success');
    }
  // Función para búsqueda avanzada con múltiples criterios
function searchProductAdvanced(productInfo) {
    if (!productInfo) {
        showNotification('No hay información del producto para buscar', 'warning');
        return;
    }
    
    // Construir query de búsqueda con todos los datos disponibles
    let searchTerms = [];
    
    // Añadir nombre del producto
    if (productInfo.name && productInfo.name !== 'Producto sin nombre') {
        searchTerms.push(`"${productInfo.name}"`);
    }
    
    // Añadir SKU
    if (productInfo.sku && productInfo.sku !== 'N/A') {
        searchTerms.push(productInfo.sku);
    }
    
    // Añadir código de barras principal
    if (productInfo.barcode) {
        searchTerms.push(productInfo.barcode);
    }
    
    // Si no hay términos de búsqueda, usar solo el código de barras
    if (searchTerms.length === 0 && productInfo.barcodes && productInfo.barcodes.length > 0) {
        searchTerms.push(productInfo.barcodes[0]);
    }
    
    if (searchTerms.length === 0) {
        showNotification('No hay suficiente información para buscar', 'warning');
        return;
    }
    
    // Crear query de búsqueda optimizada
    const searchQuery = searchTerms.join(' ');
    
    console.log('Búsqueda avanzada con términos:', searchQuery);
    
    // Abrir múltiples pestañas con diferentes estrategias de búsqueda
    const searches = [
        {
            name: 'Google Imágenes',
            url: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery)}`
        },
        {
            name: 'Google Shopping',
            url: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(searchQuery)}`
        }
    ];
    
    // Mostrar opciones de búsqueda al usuario
    showSearchOptions(searches, productInfo);
}

// Función para mostrar opciones de búsqueda
function showSearchOptions(searches, productInfo) {
    const scannerContainer = document.getElementById('scanner-container');
    
    let searchTermsHtml = '<ul style="margin: 10px 0; padding-left: 20px; color: #94a3b8;">';
    if (productInfo.name && productInfo.name !== 'Producto sin nombre') {
        searchTermsHtml += `<li>Nombre: <strong style="color: #60a5fa;">${productInfo.name}</strong></li>`;
    }
    if (productInfo.sku && productInfo.sku !== 'N/A') {
        searchTermsHtml += `<li>SKU: <strong style="color: #60a5fa;">${productInfo.sku}</strong></li>`;
    }
    if (productInfo.barcode) {
        searchTermsHtml += `<li>Código de barras: <strong style="color: #34d399;">${productInfo.barcode}</strong></li>`;
    }
    searchTermsHtml += '</ul>';
    
    let buttonsHtml = '';
    searches.forEach((search, index) => {
        buttonsHtml += `
            <button onclick="window.open('${search.url}', '_blank')" 
                    class="modal-button primary" 
                    style="margin: 5px; padding: 12px 20px; font-size: 0.95rem;">
                🔍 Buscar en ${search.name}
            </button>
        `;
    });
    
    const html = `
        <div style="padding: 16px;">
            <h3 style="color: #60a5fa; margin-top: 0;">Búsqueda de Producto</h3>
            
            <div style="background: rgba(30, 41, 59, 0.7); border-radius: 8px; padding: 15px; margin-bottom: 15px; border: 1px solid rgba(59, 130, 246, 0.3);">
                <p style="margin: 0 0 10px 0; color: var(--text-secondary);">Buscando con los siguientes datos:</p>
                ${searchTermsHtml}
            </div>
            
            <p style="color: var(--text-secondary); margin-bottom: 15px;">Selecciona dónde quieres buscar:</p>
            
            <div style="display: flex; flex-direction: column; gap: 10px;">
                ${buttonsHtml}
            </div>
            
            <button onclick="showProductAndLocationQr(window.currentProduct || lastScannedProduct)" 
                    class="modal-button danger" 
                    style="width: 100%; margin-top: 15px;">
                Volver
            </button>
        </div>
    `;
    
    scannerContainer.innerHTML = html;
    showNotification('Opciones de búsqueda disponibles', 'info');
}
}
