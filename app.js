import { db, auth, storage } from "./firebase-config.js";
import { collection, getDocs, query, where, addDoc, doc, updateDoc, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// DOM Elements
const merchantsGrid = document.getElementById('merchants-grid');
const loginBtn = document.getElementById('login-btn');
const authModal = document.getElementById('auth-modal');
const bookingModal = document.getElementById('booking-modal');
const bookingModalBody = document.getElementById('booking-modal-body');
const filterChips = document.querySelectorAll('.filter-chip');
const mapBtn = document.getElementById('map-btn');
const mapModal = document.getElementById('map-modal');
const sponsorCarousel = document.getElementById('sponsor-carousel');

// State
let allMerchants = [];
let allOffers = [];
let allSponsors = [];
let currentFilter = 'all';
let currentUser = null;
let map = null;
let markers = [];
let infoWindow = null;

// Initialization
async function init() {
    setupEventListeners();
    await loadOffersData(); // Load offers first so discounts show on cards
    await loadMerchants();
    loadSponsorsForCustomer();
}

// Load offers data (for discount display)
async function loadOffersData() {
    try {
        const snapshot = await getDocs(collection(db, "offers"));
        allOffers = [];
        snapshot.forEach(docSnap => {
            allOffers.push({ id: docSnap.id, ...docSnap.data() });
        });
    } catch (error) {
        console.error('Error loading offers:', error);
    }
}

function setupEventListeners() {
    // Dashboard Switching
    window.switchDashboard = (role) => {
        document.querySelectorAll('main').forEach(el => el.style.display = 'none');
        document.getElementById(`dashboard-${role}`).style.display = 'block';

        document.querySelectorAll('.dev-btn').forEach(btn => btn.classList.remove('active'));
        const btns = Array.from(document.querySelectorAll('.dev-btn'));
        const targetBtn = btns.find(b => b.innerText.toLowerCase().includes(role));
        if (targetBtn) targetBtn.classList.add('active');
    };

    // Login Modal
    if (loginBtn) {
        loginBtn.onclick = () => authModal.style.display = 'flex';
    }

    // Close Modals
    document.querySelectorAll('.close, .close-booking').forEach(btn => {
        btn.onclick = () => {
            authModal.style.display = 'none';
            bookingModal.style.display = 'none';
        };
    });

    // Close Map Modal
    const closeMapBtn = document.querySelector('.close-map');
    if (closeMapBtn) {
        closeMapBtn.onclick = () => {
            mapModal.style.display = 'none';
        };
    }

    // Map Button
    if (mapBtn) {
        mapBtn.onclick = () => {
            mapModal.style.display = 'flex';
            if (!map) {
                initMap();
            } else {
                // Refresh markers in case data changed
                addMarkersToMap();
            }
        };
    }

    // Filters
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentFilter = chip.dataset.type;
            renderMerchants();
        });
    });

    // Auth Form (Simulation for Prototype)
    const authForm1 = document.getElementById('auth-form-step-1');
    const authForm2 = document.getElementById('auth-form-step-2');

    if (authForm1) {
        authForm1.onsubmit = (e) => {
            e.preventDefault();
            const name = document.getElementById('auth-name').value;
            const phone = document.getElementById('auth-phone').value;
            localStorage.setItem('temp_user', JSON.stringify({ name, phone, role: 'customer' }));

            authForm1.style.display = 'none';
            authForm2.style.display = 'block';
        };
    }

    if (authForm2) {
        authForm2.onsubmit = (e) => {
            e.preventDefault();
            const code = document.getElementById('auth-code').value;
            if (code === '123456') {
                const user = JSON.parse(localStorage.getItem('temp_user'));
                currentUser = user;
                updateUIForUser();
                authModal.style.display = 'none';
                alert(`Welcome back, ${user.name}!`);
            } else {
                alert('Invalid code (use 123456)');
            }
        };
    }
}

function updateUIForUser() {
    if (!currentUser) return;
    if (loginBtn) loginBtn.style.display = 'none';
    const profileDiv = document.getElementById('user-profile');
    const userNameSpan = document.getElementById('user-name');
    if (profileDiv && userNameSpan) {
        profileDiv.style.display = 'block';
        userNameSpan.textContent = currentUser.name;
    }
}

// Fetch Data
async function loadMerchants() {
    // Show skeleton loading cards
    const skeletonCount = 6;
    let skeletonHTML = '';
    for (let i = 0; i < skeletonCount; i++) {
        skeletonHTML += `
            <div class="skeleton-card">
                <div class="skeleton-image"></div>
                <div class="skeleton skeleton-text short"></div>
                <div class="skeleton skeleton-text title"></div>
                <div class="skeleton skeleton-text medium"></div>
                <div class="skeleton skeleton-text short"></div>
            </div>
        `;
    }
    merchantsGrid.innerHTML = skeletonHTML;

    try {
        const querySnapshot = await getDocs(collection(db, "merchants"));
        allMerchants = [];
        querySnapshot.forEach((doc) => {
            allMerchants.push({ id: doc.id, ...doc.data() });
        });
        renderMerchants();
    } catch (error) {
        console.error("Error loading merchants:", error);
        merchantsGrid.innerHTML = '<div style="text-align:center">Failed to load data. Please ensure Firestore is enabled and seeded.</div>';
    }
}

// Render Grid with Photos
function renderMerchants() {
    const filtered = currentFilter === 'all'
        ? allMerchants
        : allMerchants.filter(m => m.type === currentFilter);

    if (filtered.length === 0) {
        merchantsGrid.innerHTML = '<div class="empty-state">No venues found.</div>';
        return;
    }

    merchantsGrid.innerHTML = filtered.map(merchant => {
        // Check if merchant has a photo URL
        const imageContent = merchant.photoUrl
            ? `<img src="${merchant.photoUrl}" alt="${merchant.name}" onerror="this.outerHTML='<span class=\\'emoji-fallback\\'>${merchant.image || '✨'}</span>'">`
            : `<span class="emoji-fallback">${merchant.image || '✨'}</span>`;

        // Check if this merchant has active offers
        const now = new Date();
        const merchantOffers = allOffers.filter(o => {
            if (o.storeId !== merchant.id) return false;
            const endDate = o.endDate?.toDate ? o.endDate.toDate() : new Date(o.endDate);
            return endDate > now && o.active;
        });
        const hasDiscount = merchantOffers.length > 0;
        const maxDiscount = hasDiscount ? Math.max(...merchantOffers.map(o => o.discountPercent)) : 0;

        return `
        <div class="merchant-card" onclick="openMerchantDetails('${merchant.id}')">
            <div class="card-img-top">
                ${imageContent}
                ${hasDiscount ? `<div class="discount-badge">🔥 Up to ${maxDiscount}% OFF</div>` : ''}
            </div>
            <div class="card-body">
                <span class="card-tag">${merchant.category}</span>
                <h3 class="card-title">${merchant.name}</h3>
                <div class="card-meta">
                    <span>⭐ ${merchant.rating}</span>
                    <span>•</span>
                    <span>📍 ${merchant.distance}</span>
                </div>
                <p style="color: #6b7280; font-size: 0.9rem;">${merchant.address}</p>
                ${merchant.lat && merchant.lng ? `<span class="btn-map-link" onclick="event.stopPropagation(); showOnMap('${merchant.id}')">📍 View on Map</span>` : ''}
            </div>
        </div>
    `}).join('');
}

// ========== MAP FUNCTIONALITY ==========

// Initialize Google Map
function initMap() {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;

    // Center on Erbil
    const erbilCenter = { lat: 36.1912, lng: 44.0095 };

    map = new google.maps.Map(mapContainer, {
        center: erbilCenter,
        zoom: 13,
        styles: [
            {
                "featureType": "poi.business",
                "stylers": [{ "visibility": "off" }]
            }
        ]
    });

    infoWindow = new google.maps.InfoWindow();

    addMarkersToMap();
}

// Add markers for all merchants
function addMarkersToMap() {
    // Clear existing markers
    markers.forEach(marker => marker.setMap(null));
    markers = [];

    if (!map) return;

    allMerchants.forEach(merchant => {
        if (!merchant.lat || !merchant.lng) return;

        const markerColor = merchant.type === 'salon' ? '#9d4edd' : '#e0aaff';

        const marker = new google.maps.Marker({
            position: { lat: merchant.lat, lng: merchant.lng },
            map: map,
            title: merchant.name,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: markerColor,
                fillOpacity: 0.9,
                strokeColor: '#ffffff',
                strokeWeight: 2
            }
        });

        // Create info window content
        const infoContent = `
            <div class="map-info-window">
                <h3>${merchant.name}</h3>
                <p><strong>${merchant.category}</strong></p>
                <p>⭐ ${merchant.rating} • ${merchant.distance}</p>
                <p>📍 ${merchant.address}</p>
                <button class="btn-primary" onclick="openMerchantDetails('${merchant.id}'); document.getElementById('map-modal').style.display='none';">
                    View Details
                </button>
            </div>
        `;

        marker.addListener('click', () => {
            infoWindow.setContent(infoContent);
            infoWindow.open(map, marker);
        });

        markers.push(marker);
    });
}

// Show specific merchant on map
window.showOnMap = function (id) {
    const merchant = allMerchants.find(m => m.id === id);
    if (!merchant || !merchant.lat || !merchant.lng) return;

    mapModal.style.display = 'flex';

    if (!map) {
        initMap();
        // Wait for map to initialize then center
        setTimeout(() => {
            map.setCenter({ lat: merchant.lat, lng: merchant.lng });
            map.setZoom(15);
            // Find and click the marker
            const marker = markers.find(m => m.getTitle() === merchant.name);
            if (marker) {
                google.maps.event.trigger(marker, 'click');
            }
        }, 300);
    } else {
        map.setCenter({ lat: merchant.lat, lng: merchant.lng });
        map.setZoom(15);
        const marker = markers.find(m => m.getTitle() === merchant.name);
        if (marker) {
            google.maps.event.trigger(marker, 'click');
        }
    }
}

// Global callback for Google Maps API
window.initMapCallback = function () {
    console.log('Google Maps API loaded');
}

// Global scope for HTML access
window.openMerchantDetails = function (id) {
    const merchant = allMerchants.find(m => m.id === id);
    if (!merchant) return;

    // Get active offers for this merchant
    const now = new Date();
    const merchantOffers = allOffers.filter(o => {
        if (o.storeId !== merchant.id) return false;
        const endDate = o.endDate?.toDate ? o.endDate.toDate() : new Date(o.endDate);
        return endDate > now && o.active;
    });

    // Generate services HTML with discounts
    const servicesHtml = merchant.services ? merchant.services.map((s, index) => {
        // Match by serviceName instead of serviceIndex to survive reordering
        const offer = merchantOffers.find(o => o.serviceName === s.name);
        const hasDiscount = !!offer;
        const discountPercent = offer?.discountPercent || 0;
        const newPrice = hasDiscount ? Math.round(s.price * (1 - discountPercent / 100)) : s.price;

        return `
        <div class="service-row" style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee;">
            <div>
                <div style="font-weight: 500; display: flex; align-items: center; gap: 8px;">
                    ${s.name}
                    ${hasDiscount ? `<span class="service-discount-tag">${discountPercent}% OFF</span>` : ''}
                </div>
                <div style="font-size: 0.8rem; color: #888;">${s.duration} mins</div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="text-align: right;">
                    ${hasDiscount ? `
                        <div style="font-size: 0.75rem; color: #999; text-decoration: line-through;">${s.price.toLocaleString()} IQD</div>
                        <div style="font-weight: 600; color: #16a34a;">${newPrice.toLocaleString()} IQD</div>
                    ` : `
                        <div style="font-weight: 600;">${s.price.toLocaleString()} IQD</div>
                    `}
                </div>
                <button class="btn-outline" style="padding: 4px 12px; font-size: 0.8rem;" 
                    onclick="initiateBooking('${merchant.id}', '${s.name}', ${newPrice})">Book</button>
            </div>
        </div>
    `}).join('') : '<p>No services listed.</p>';

    // Photo or emoji for header
    const headerImage = merchant.photoUrl
        ? `<img src="${merchant.photoUrl}" alt="${merchant.name}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px; margin-bottom: 15px;">`
        : '';

    bookingModalBody.innerHTML = `
        ${headerImage}
        <div class="modal-header" style="text-align: center; margin-bottom: 20px;">
            <h2 style="margin-bottom: 5px;">${merchant.name}</h2>
            <p style="color: #666;">${merchant.address}</p>
            ${merchant.lat && merchant.lng ? `<span class="btn-map-link" onclick="showOnMap('${merchant.id}'); document.getElementById('booking-modal').style.display='none';">📍 View on Map</span>` : ''}
        </div>
        <h3 style="margin-bottom: 15px; font-size: 1.1rem;">Select Service</h3>
        <div class="services-list">
            ${servicesHtml}
        </div>
    `;
    bookingModal.style.display = 'flex';
}

window.initiateBooking = async function (merchantId, serviceName, price) {
    if (!currentUser) {
        alert("Please login first to book an appointment.");
        bookingModal.style.display = 'none';
        authModal.style.display = 'flex';
        return;
    }

    if (confirm(`Confirm booking for ${serviceName} ($${price})?`)) {
        try {
            await addDoc(collection(db, "bookings"), {
                merchantId,
                serviceName,
                price,
                customerId: currentUser.phone,
                customerName: currentUser.name,
                status: 'pending',
                createdAt: new Date()
            });
            alert("Booking request sent! The owner will confirm shortly.");
            bookingModal.style.display = 'none';
        } catch (e) {
            console.error("Error booking:", e);
            alert("Failed to book. Try again.");
        }
    }
}

// ========== ADMIN FUNCTIONS ==========

// Admin Tab Switching
window.addEventListener('DOMContentLoaded', () => {
    const adminTabs = document.querySelectorAll('.admin-tab');
    adminTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            adminTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Hide all panels
            document.querySelectorAll('.admin-panel').forEach(p => p.style.display = 'none');

            // Show target panel
            const targetId = `admin-${tab.dataset.tab}`;
            document.getElementById(targetId).style.display = 'block';

            // Load data for the tab
            if (tab.dataset.tab === 'stores') loadAdminStores();
            if (tab.dataset.tab === 'offers') loadAdminOffers();
            if (tab.dataset.tab === 'sponsors') loadAdminSponsors();
        });
    });
});

// Load admin stores
async function loadAdminStores() {
    const tbody = document.getElementById('stores-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

    try {
        const snapshot = await getDocs(collection(db, "merchants"));
        allMerchants = [];
        snapshot.forEach(docSnap => {
            allMerchants.push({ id: docSnap.id, ...docSnap.data() });
        });

        tbody.innerHTML = allMerchants.map(store => `
            <tr>
                <td><strong>${store.name}</strong></td>
                <td>${store.category}</td>
                <td>${store.address || 'N/A'}</td>
                <td>
                    <span class="status-badge ${store.suspended ? 'suspended' : 'active'}">
                        ${store.suspended ? '🔴 Suspended' : '🟢 Active'}
                    </span>
                </td>
                <td>
                    <button class="action-btn" onclick="editStore('${store.id}')">✏️ Edit</button>
                    <button class="action-btn ${store.suspended ? '' : 'danger'}" onclick="toggleSuspend('${store.id}', ${!store.suspended})">
                        ${store.suspended ? '▶️ Activate' : '⏸️ Suspend'}
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading stores:', error);
        tbody.innerHTML = '<tr><td colspan="5">Error loading stores</td></tr>';
    }
}

// Open create store modal
window.openCreateStoreModal = function () {
    document.getElementById('store-modal-title').innerText = 'Create New Store';
    document.getElementById('store-form').reset();
    document.getElementById('store-id').value = '';

    // Clear preview
    const preview = document.getElementById('store-photo-preview');
    preview.src = '';
    preview.style.display = 'none';
    document.getElementById('store-photo').value = '';

    // Hide services section for new stores
    document.getElementById('services-reorder-section').style.display = 'none';

    document.getElementById('store-modal').style.display = 'flex';
};

// Edit store
window.editStore = function (id) {
    const store = allMerchants.find(m => m.id === id);
    if (!store) return;

    document.getElementById('store-modal-title').innerText = 'Edit Store';
    document.getElementById('store-id').value = id;
    document.getElementById('store-name').value = store.name;
    document.getElementById('store-type').value = store.type;
    document.getElementById('store-category').value = store.category;
    document.getElementById('store-address').value = store.address || '';

    // Update preview + hidden input
    document.getElementById('store-photo').value = store.photoUrl || '';
    const preview = document.getElementById('store-photo-preview');
    if (store.photoUrl) {
        preview.src = store.photoUrl;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }

    // Show services reorder section and populate it
    const servicesSection = document.getElementById('services-reorder-section');
    servicesSection.style.display = 'block';
    renderServicesForReorder(store.services || []);

    document.getElementById('store-modal').style.display = 'flex';
};

// File input preview listener
document.getElementById('store-photo-file')?.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const preview = document.getElementById('store-photo-preview');
            preview.src = e.target.result;
            preview.style.display = 'block';
        }
        reader.readAsDataURL(file);
    }
});

// Store the current editing store ID for service reorder
let currentEditingStoreId = null;

// Render services for management (edit, delete, reorder)
function renderServicesForReorder(services) {
    const container = document.getElementById('services-sortable-list');
    currentEditingStoreId = document.getElementById('store-id').value;

    if (!services || services.length === 0) {
        container.innerHTML = '<p style="color: #888; text-align: center;">No services yet. Add your first service!</p>';
        return;
    }

    container.innerHTML = services.map((s, i) => `
        <div class="sortable-item" draggable="true" data-index="${i}" data-name="${s.name}" data-price="${s.price}" data-duration="${s.duration}">
            <div class="drag-handle">
                <div class="drag-handle-bar"></div>
                <div class="drag-handle-bar"></div>
                <div class="drag-handle-bar"></div>
            </div>
            <div class="service-info">
                <div class="service-name">${s.name}</div>
                <div class="service-meta">${s.duration} mins • ${s.price.toLocaleString()} IQD</div>
            </div>
            <div class="service-actions">
                <button type="button" class="service-action-btn edit" onclick="openEditServiceModal(${i})" title="Edit Service">✏️</button>
                <button type="button" class="service-action-btn delete" onclick="deleteService(${i})" title="Delete Service">🗑️</button>
            </div>
            <div class="service-order">${i + 1}</div>
        </div>
    `).join('');

    // Setup drag and drop
    setupDragAndDrop();
}

// Setup drag and drop functionality
function setupDragAndDrop() {
    const container = document.getElementById('services-sortable-list');
    const items = container.querySelectorAll('.sortable-item');

    items.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragleave', handleDragLeave);
    });
}

let draggedItem = null;

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.index);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.sortable-item').forEach(item => {
        item.classList.remove('drag-over');
    });
    updateOrderNumbers();
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
    if (this !== draggedItem) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    if (this !== draggedItem) {
        const container = document.getElementById('services-sortable-list');
        const allItems = [...container.querySelectorAll('.sortable-item')];
        const fromIndex = allItems.indexOf(draggedItem);
        const toIndex = allItems.indexOf(this);

        if (fromIndex < toIndex) {
            this.parentNode.insertBefore(draggedItem, this.nextSibling);
        } else {
            this.parentNode.insertBefore(draggedItem, this);
        }
    }
    this.classList.remove('drag-over');
}

function updateOrderNumbers() {
    const items = document.querySelectorAll('#services-sortable-list .sortable-item');
    items.forEach((item, i) => {
        item.dataset.index = i;
        item.querySelector('.service-order').textContent = i + 1;
    });
}

// Save services (including any edits, additions, or reordering)
window.saveServicesOrder = async function () {
    const storeId = document.getElementById('store-id').value;
    if (!storeId) return;

    const store = allMerchants.find(m => m.id === storeId);
    if (!store) return;

    // Get current order from DOM (services may have been added, edited, or reordered)
    const items = document.querySelectorAll('#services-sortable-list .sortable-item');
    const newServices = [];

    items.forEach(item => {
        const name = item.dataset.name;
        const price = parseInt(item.dataset.price);
        const duration = parseInt(item.dataset.duration);
        newServices.push({ name, price, duration });
    });

    try {
        await updateDoc(doc(db, "merchants", storeId), { services: newServices });

        // Update local data
        store.services = newServices;

        alert('✅ Services saved successfully!');
        loadAdminStores();
        renderMerchants();
    } catch (error) {
        console.error('Error saving services:', error);
        alert('Failed to save services');
    }
};

// Open modal to edit an existing service
window.openEditServiceModal = function (index) {
    const items = document.querySelectorAll('#services-sortable-list .sortable-item');
    const item = items[index];
    if (!item) return;

    document.getElementById('service-modal-title').textContent = 'Edit Service';
    document.getElementById('service-edit-index').value = index;
    document.getElementById('service-edit-name').value = item.dataset.name;
    document.getElementById('service-edit-price').value = item.dataset.price;
    document.getElementById('service-edit-duration').value = item.dataset.duration;

    document.getElementById('service-modal').style.display = 'flex';
};

// Open modal to add a new service
window.openAddServiceModal = function () {
    document.getElementById('service-modal-title').textContent = 'Add New Service';
    document.getElementById('service-edit-index').value = '-1'; // -1 indicates new service
    document.getElementById('service-form').reset();

    document.getElementById('service-modal').style.display = 'flex';
};

// Delete a service from the list
window.deleteService = function (index) {
    const items = document.querySelectorAll('#services-sortable-list .sortable-item');
    const item = items[index];
    if (!item) return;

    const serviceName = item.dataset.name;
    if (!confirm(`Delete service "${serviceName}"? This will be saved when you click "Save Changes".`)) return;

    // Remove from DOM
    item.remove();

    // Update order numbers
    updateOrderNumbers();
};

// Service form submission (for both edit and add)
document.getElementById('service-form')?.addEventListener('submit', function (e) {
    e.preventDefault();

    const index = parseInt(document.getElementById('service-edit-index').value);
    const name = document.getElementById('service-edit-name').value.trim();
    const price = parseInt(document.getElementById('service-edit-price').value);
    const duration = parseInt(document.getElementById('service-edit-duration').value);

    if (!name || isNaN(price) || isNaN(duration)) {
        alert('Please fill in all fields correctly.');
        return;
    }

    const container = document.getElementById('services-sortable-list');
    const items = container.querySelectorAll('.sortable-item');

    if (index === -1) {
        // Adding new service
        const newIndex = items.length;
        const newItemHtml = `
            <div class="sortable-item" draggable="true" data-index="${newIndex}" data-name="${name}" data-price="${price}" data-duration="${duration}">
                <div class="drag-handle">
                    <div class="drag-handle-bar"></div>
                    <div class="drag-handle-bar"></div>
                    <div class="drag-handle-bar"></div>
                </div>
                <div class="service-info">
                    <div class="service-name">${name}</div>
                    <div class="service-meta">${duration} mins • ${price.toLocaleString()} IQD</div>
                </div>
                <div class="service-actions">
                    <button type="button" class="service-action-btn edit" onclick="openEditServiceModal(${newIndex})" title="Edit Service">✏️</button>
                    <button type="button" class="service-action-btn delete" onclick="deleteService(${newIndex})" title="Delete Service">🗑️</button>
                </div>
                <div class="service-order">${newIndex + 1}</div>
            </div>
        `;

        // Check if there's an "empty" message and remove it
        const emptyMsg = container.querySelector('p');
        if (emptyMsg) {
            container.innerHTML = '';
        }

        container.insertAdjacentHTML('beforeend', newItemHtml);

        // Re-setup drag and drop for the new item
        const newItem = container.lastElementChild;
        newItem.addEventListener('dragstart', handleDragStart);
        newItem.addEventListener('dragend', handleDragEnd);
        newItem.addEventListener('dragover', handleDragOver);
        newItem.addEventListener('drop', handleDrop);
        newItem.addEventListener('dragenter', handleDragEnter);
        newItem.addEventListener('dragleave', handleDragLeave);
    } else {
        // Editing existing service
        const item = items[index];
        if (item) {
            item.dataset.name = name;
            item.dataset.price = price;
            item.dataset.duration = duration;
            item.querySelector('.service-name').textContent = name;
            item.querySelector('.service-meta').textContent = `${duration} mins • ${price.toLocaleString()} IQD`;
        }
    }

    closeModal('service-modal');
    updateOrderNumbers();
});

// Hide services section when opening create modal
window.openCreateStoreModal = function () {
    document.getElementById('store-modal-title').innerText = 'Create New Store';
    document.getElementById('store-form').reset();
    document.getElementById('store-id').value = '';
    document.getElementById('services-reorder-section').style.display = 'none';
    document.getElementById('store-modal').style.display = 'flex';
};

// Toggle suspend
window.toggleSuspend = async function (id, suspend) {
    try {
        await updateDoc(doc(db, "merchants", id), { suspended: suspend });
        loadAdminStores();
        renderMerchants(); // Refresh customer view too
    } catch (error) {
        console.error('Error updating store:', error);
        alert('Failed to update store status');
    }
};

// Close modal
window.closeModal = function (modalId) {
    document.getElementById(modalId).style.display = 'none';
};

// Helper to upload image
async function uploadImage(file, path) {
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
}

// Store form submit (Handles Store Details + Services + Photo Upload)
document.getElementById('store-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('store-id').value;
    const saveBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    try {
        let photoUrl = document.getElementById('store-photo').value;
        const fileInput = document.getElementById('store-photo-file');

        // Handle File Upload
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const path = `stores/${Date.now()}_${file.name}`;
            photoUrl = await uploadImage(file, path);
        }

        const storeData = {
            name: document.getElementById('store-name').value,
            type: document.getElementById('store-type').value,
            category: document.getElementById('store-category').value,
            address: document.getElementById('store-address').value,
            photoUrl: photoUrl
        };

        // Gather services from the sortable list
        // This ensures any edits, reordering, or additions are saved
        const serviceItems = document.querySelectorAll('#services-sortable-list .sortable-item');
        if (serviceItems.length > 0) {
            const services = [];
            serviceItems.forEach(item => {
                services.push({
                    name: item.dataset.name,
                    price: parseInt(item.dataset.price),
                    duration: parseInt(item.dataset.duration)
                });
            });
            storeData.services = services;
        } else if (!id) {
            // New store default services
            storeData.services = [
                { name: 'Consultation', price: 15000, duration: 30 },
                { name: 'Basic Service', price: 25000, duration: 45 },
                { name: 'Premium Service', price: 45000, duration: 60 }
            ];
        }

        if (id) {
            // Update existing store
            storeData.suspended = false; // Ensure it doesn't get accidentally archived if that field is missing
            // We usually don't overwrite rating/location here unless fields existed, keeping existing values
            // But updateDoc only updates specified fields.
            // Wait, the previous code re-generated random rating/location for edits? No, only for new.
            // My code above for `storeData` only includes the form fields. 
            // That's correct for update. Firestore `updateDoc` merges.
            await updateDoc(doc(db, "merchants", id), storeData);
        } else {
            // Create New Store
            storeData.rating = Math.round((Math.random() * 2 + 3) * 10) / 10;
            storeData.distance = `${Math.floor(Math.random() * 15 + 1)} km`;
            storeData.lat = 36.19 + (Math.random() * 0.05);
            storeData.lng = 44.01 + (Math.random() * 0.04);
            storeData.suspended = false;
            await addDoc(collection(db, "merchants"), storeData);
        }

        closeModal('store-modal');
        loadAdminStores();
        loadMerchants();
        alert('✅ Store and services saved successfully!');

    } catch (error) {
        console.error('Error saving store:', error);
        alert('Failed to save store: ' + error.message);
    } finally {
        saveBtn.textContent = originalBtnText;
        saveBtn.disabled = false;
    }
});

// ========== OFFERS FUNCTIONS ==========

async function loadAdminOffers() {
    const tbody = document.getElementById('offers-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

    try {
        const snapshot = await getDocs(collection(db, "offers"));
        allOffers = [];
        snapshot.forEach(docSnap => {
            allOffers.push({ id: docSnap.id, ...docSnap.data() });
        });

        if (allOffers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #888;">No offers yet</td></tr>';
            return;
        }

        const now = new Date();
        tbody.innerHTML = allOffers.map(offer => {
            const store = allMerchants.find(m => m.id === offer.storeId);
            const endDate = offer.endDate?.toDate ? offer.endDate.toDate() : new Date(offer.endDate);
            const isExpired = endDate < now;
            const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

            return `
            <tr>
                <td>${store?.name || 'Unknown'}</td>
                <td>${offer.serviceName}</td>
                <td><strong style="color: #16a34a;">${offer.discountPercent}% OFF</strong></td>
                <td>${isExpired ? 'Ended' : `${daysLeft} days left`}</td>
                <td>
                    <span class="status-badge ${isExpired ? 'expired' : 'active'}">
                        ${isExpired ? '⚫ Expired' : '🟢 Active'}
                    </span>
                </td>
                <td>
                    <button class="action-btn danger" onclick="deleteOffer('${offer.id}')">🗑️ Delete</button>
                </td>
            </tr>
        `}).join('');
    } catch (error) {
        console.error('Error loading offers:', error);
        tbody.innerHTML = '<tr><td colspan="6">Error loading offers</td></tr>';
    }
}

window.openCreateOfferModal = function () {
    const storeSelect = document.getElementById('offer-store');
    storeSelect.innerHTML = allMerchants
        .filter(m => !m.suspended)
        .map(m => `<option value="${m.id}">${m.name}</option>`)
        .join('');

    // Load services for first store
    updateOfferServices();

    document.getElementById('offer-form').reset();
    document.getElementById('offer-modal').style.display = 'flex';
};

function updateOfferServices() {
    const storeId = document.getElementById('offer-store').value;
    const store = allMerchants.find(m => m.id === storeId);
    const serviceSelect = document.getElementById('offer-service');

    if (store?.services) {
        serviceSelect.innerHTML = store.services.map((s, i) =>
            `<option value="${i}">${s.name} - ${s.price.toLocaleString()} IQD</option>`
        ).join('');
    } else {
        serviceSelect.innerHTML = '<option>No services</option>';
    }
}

document.getElementById('offer-store')?.addEventListener('change', updateOfferServices);

document.getElementById('offer-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const storeId = document.getElementById('offer-store').value;
    const store = allMerchants.find(m => m.id === storeId);
    const serviceIndex = parseInt(document.getElementById('offer-service').value);
    const service = store?.services?.[serviceIndex];

    const durationDays = parseInt(document.getElementById('offer-duration').value);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    // Use serviceName (not serviceIndex) so offers survive service reordering
    const offerData = {
        storeId,
        storeName: store?.name,
        serviceName: service?.name || 'Service',
        discountPercent: parseInt(document.getElementById('offer-discount').value),
        startDate: Timestamp.now(),
        endDate: Timestamp.fromDate(endDate),
        active: true
    };

    try {
        await addDoc(collection(db, "offers"), offerData);
        closeModal('offer-modal');
        loadAdminOffers();
    } catch (error) {
        console.error('Error creating offer:', error);
        alert('Failed to create offer');
    }
});

window.deleteOffer = async function (id) {
    if (!confirm('Delete this offer?')) return;
    try {
        await deleteDoc(doc(db, "offers", id));
        loadAdminOffers();
    } catch (error) {
        console.error('Error deleting offer:', error);
    }
};

// ========== SPONSORS FUNCTIONS ==========

async function loadAdminSponsors() {
    const storesList = document.getElementById('sponsored-stores-list');
    const adsList = document.getElementById('external-ads-list');
    if (!storesList || !adsList) return;

    try {
        const snapshot = await getDocs(collection(db, "sponsors"));
        allSponsors = [];
        snapshot.forEach(docSnap => {
            allSponsors.push({ id: docSnap.id, ...docSnap.data() });
        });

        const storeSponsors = allSponsors.filter(s => s.type === 'store');
        const externalSponsors = allSponsors.filter(s => s.type === 'external');

        storesList.innerHTML = storeSponsors.length ? storeSponsors.map(s => {
            const store = allMerchants.find(m => m.id === s.storeId);
            return `
                <div class="sponsored-item-card">
                    <img src="${store?.photoUrl || 'https://via.placeholder.com/60'}" alt="">
                    <div class="sponsored-item-info">
                        <h4>${store?.name || 'Store'}</h4>
                        <p>${store?.category || ''}</p>
                    </div>
                    <button class="action-btn danger" onclick="deleteSponsor('${s.id}')">🗑️</button>
                </div>
            `;
        }).join('') : '<p class="sponsor-empty">No sponsored stores yet</p>';

        adsList.innerHTML = externalSponsors.length ? externalSponsors.map(s => `
            <div class="sponsored-item-card">
                <img src="${s.imageUrl || 'https://via.placeholder.com/60'}" alt="">
                <div class="sponsored-item-info">
                    <h4>${s.title || 'Advertisement'}</h4>
                    <p><a href="${s.linkUrl}" target="_blank">🔗 ${s.linkUrl?.substring(0, 30)}...</a></p>
                </div>
                <button class="action-btn danger" onclick="deleteSponsor('${s.id}')">🗑️</button>
            </div>
        `).join('') : '<p class="sponsor-empty">No external ads yet</p>';

    } catch (error) {
        console.error('Error loading sponsors:', error);
    }
}

window.openCreateSponsorModal = function () {
    const storeSelect = document.getElementById('sponsor-store');
    storeSelect.innerHTML = allMerchants
        .filter(m => !m.suspended)
        .map(m => `<option value="${m.id}">${m.name}</option>`)
        .join('');

    document.getElementById('sponsor-form').reset();
    document.getElementById('sponsor-store-fields').style.display = 'block';
    document.getElementById('sponsor-external-fields').style.display = 'none';
    document.getElementById('sponsor-modal').style.display = 'flex';
};

window.toggleSponsorFields = function () {
    const type = document.getElementById('sponsor-type').value;
    document.getElementById('sponsor-store-fields').style.display = type === 'store' ? 'block' : 'none';
    document.getElementById('sponsor-external-fields').style.display = type === 'external' ? 'block' : 'none';
};

document.getElementById('sponsor-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const type = document.getElementById('sponsor-type').value;
    const durationDays = parseInt(document.getElementById('sponsor-duration').value);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    const sponsorData = {
        type,
        startDate: Timestamp.now(),
        endDate: Timestamp.fromDate(endDate),
        active: true
    };

    if (type === 'store') {
        sponsorData.storeId = document.getElementById('sponsor-store').value;
    } else {
        sponsorData.imageUrl = document.getElementById('sponsor-image').value;
        sponsorData.linkUrl = document.getElementById('sponsor-link').value;
        sponsorData.title = document.getElementById('sponsor-title').value;
    }

    try {
        await addDoc(collection(db, "sponsors"), sponsorData);
        closeModal('sponsor-modal');
        loadAdminSponsors();
        loadSponsorsForCustomer();
    } catch (error) {
        console.error('Error creating sponsor:', error);
        alert('Failed to add sponsor');
    }
});

window.deleteSponsor = async function (id) {
    if (!confirm('Remove this sponsor?')) return;
    try {
        await deleteDoc(doc(db, "sponsors", id));
        loadAdminSponsors();
        loadSponsorsForCustomer();
    } catch (error) {
        console.error('Error deleting sponsor:', error);
    }
};

// ========== CUSTOMER SPONSOR BANNER ==========

async function loadSponsorsForCustomer() {
    if (!sponsorCarousel) return;

    try {
        const snapshot = await getDocs(collection(db, "sponsors"));
        const now = new Date();
        const activeSponsors = [];

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const endDate = data.endDate?.toDate ? data.endDate.toDate() : new Date(data.endDate);
            if (endDate > now && data.active) {
                activeSponsors.push({ id: docSnap.id, ...data });
            }
        });

        if (activeSponsors.length === 0) {
            sponsorCarousel.innerHTML = '';
            sponsorCarousel.parentElement.parentElement.style.display = 'none';
            return;
        }

        sponsorCarousel.parentElement.parentElement.style.display = 'block';

        sponsorCarousel.innerHTML = activeSponsors.map(sponsor => {
            if (sponsor.type === 'store') {
                const store = allMerchants.find(m => m.id === sponsor.storeId);
                if (!store) return '';
                return `
                    <div class="sponsor-card" onclick="openMerchantDetails('${store.id}')">
                        <img src="${store.photoUrl || 'https://via.placeholder.com/320x140'}" alt="${store.name}">
                        <div class="sponsor-card-body">
                            <h4>${store.name}</h4>
                            <p>📍 ${store.address || store.category}</p>
                        </div>
                    </div>
                `;
            } else {
                return `
                    <a href="${sponsor.linkUrl}" target="_blank" class="sponsor-card" style="text-decoration: none;">
                        <img src="${sponsor.imageUrl || 'https://via.placeholder.com/320x140'}" alt="${sponsor.title}">
                        <div class="sponsor-card-body">
                            <h4>${sponsor.title || 'Special Offer'}</h4>
                            <p>🔗 Learn More</p>
                        </div>
                    </a>
                `;
            }
        }).join('');

    } catch (error) {
        console.error('Error loading sponsors:', error);
        sponsorCarousel.innerHTML = '';
    }
}

// Load sponsors when merchants load
const originalLoadMerchants = loadMerchants;
async function loadMerchantsWithSponsors() {
    await originalLoadMerchants.call(this);
    loadSponsorsForCustomer();
}

// Start
init();
