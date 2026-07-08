/**
 * Customer Shopping Behavior Insight Engine
 * Core Frontend Logic, Chart.js Integration, SQL Simulation, and Multi-Step Web Form
 */

// Application State
const state = {
  customers: [],
  filters: {
    gender: 'All',
    category: 'All',
    season: 'All',
    subscription: 'All',
    ageMin: 18,
    ageMax: 70,
  },
  currentTab: 'dashboard',
  editingCustomerId: null,
  activeFormStep: 1,
  activeSqlQueryIndex: 0,
  activeCodeView: 'sql',
  explorerPagination: {
    currentPage: 1,
    pageSize: 25,
    sortBy: 'customer_id',
    sortOrder: 'asc',
    searchQuery: ''
  },
  // Cache charts instances
  charts: {}
};

// Unique category lists derived from dataset
let categoryItemsMap = {};
let uniqueStates = [];

// Local Storage Keys
const LS_CUSTOM_RECORDS = 'customer_behavior_custom_records';
const LS_DELETED_IDS = 'customer_behavior_deleted_ids';
const LS_EDITED_RECORDS = 'customer_behavior_edited_records';

/**
 * 1. INITIALIZATION & DATA LOADING
 */
document.addEventListener('DOMContentLoaded', () => {
  loadDataset();
  initializeUI();
  setupEventListeners();
  switchTab('dashboard');
  
  // Create charts initially
  renderCharts();
  
  // Run first update
  updateApp();
});

function loadDataset() {
  // initialCustomerData is loaded from js/dataset.js
  let baseData = [...initialCustomerData];
  
  // Load custom added records
  const customRecords = JSON.parse(localStorage.getItem(LS_CUSTOM_RECORDS) || '[]');
  
  // Load deleted IDs
  const deletedIds = new Set(JSON.parse(localStorage.getItem(LS_DELETED_IDS) || '[]'));
  
  // Load edited overrides
  const editedRecords = JSON.parse(localStorage.getItem(LS_EDITED_RECORDS) || '{}');
  
  // Filter out deleted records and apply edits to initial data
  baseData = baseData.filter(item => !deletedIds.has(item.customer_id));
  
  baseData = baseData.map(item => {
    if (editedRecords[item.customer_id]) {
      return { ...item, ...editedRecords[item.customer_id] };
    }
    return item;
  });
  
  // Merge in new custom records (filter out if they were deleted later, though rare)
  const activeCustom = customRecords.filter(item => !deletedIds.has(item.customer_id));
  
  // Combined working dataset
  state.customers = [...baseData, ...activeCustom];
  
  // Update badges
  document.getElementById('record-count-badge').textContent = `${state.customers.length.toLocaleString()} Records Loaded`;
  
  // Derive category -> items mapping
  categoryItemsMap = {};
  uniqueStates = new Set();
  
  state.customers.forEach(item => {
    uniqueStates.add(item.location);
    if (!categoryItemsMap[item.category]) {
      categoryItemsMap[item.category] = new Set();
    }
    categoryItemsMap[item.category].add(item.item_purchased);
  });
  
  // Convert sets to sorted arrays
  uniqueStates = Array.from(uniqueStates).sort();
  for (const cat in categoryItemsMap) {
    categoryItemsMap[cat] = Array.from(categoryItemsMap[cat]).sort();
  }
}

function initializeUI() {
  lucide.createIcons();
  
  // Populate States Dropdowns
  const filterStateSel = document.createElement('div'); // placeholder or inside grid if added
  const formLocationSel = document.getElementById('form-location');
  
  // We can add location selector to filters grid if we want, but keeping filter grid clean.
  // Add options to Form location dropdown
  uniqueStates.forEach(stateName => {
    const opt = document.createElement('option');
    opt.value = stateName;
    opt.textContent = stateName;
    formLocationSel.appendChild(opt);
  });
  
  // Populate SQL Queries list in sidebar
  populateSqlQueriesMenu();
}

/**
 * 2. APP STATE SYNCHRONIZATION
 */
function updateApp() {
  const filtered = getFilteredData();
  
  // Update counts
  document.getElementById('record-count-badge').textContent = `${state.customers.length.toLocaleString()} Records Loaded`;
  
  // Update header quick stats & Dashboard KPIs
  updateKPIs(filtered);
  
  // Refresh Chart.js charts
  updateChartsData(filtered);
  
  // Update table grid
  renderExplorerTable();
}

function getFilteredData() {
  return state.customers.filter(item => {
    // Gender Filter
    if (state.filters.gender !== 'All' && item.gender !== state.filters.gender) return false;
    
    // Category Filter
    if (state.filters.category !== 'All' && item.category !== state.filters.category) return false;
    
    // Season Filter
    if (state.filters.season !== 'All' && item.season !== state.filters.season) return false;
    
    // Subscription Filter
    if (state.filters.subscription !== 'All' && item.subscription_status !== state.filters.subscription) return false;
    
    // Age Filter
    if (item.age < state.filters.ageMin || item.age > state.filters.ageMax) return false;
    
    return true;
  });
}

function updateKPIs(data) {
  const count = data.length;
  
  let revenue = 0;
  let ratingSum = 0;
  let loyalCount = 0;
  let subCount = 0;
  
  data.forEach(item => {
    revenue += item.purchase_amount;
    ratingSum += item.review_rating;
    if (item.previous_purchases > 10) loyalCount++;
    if (item.subscription_status === 'Yes') subCount++;
  });
  
  const avgRating = count > 0 ? ratingSum / count : 0;
  const aov = count > 0 ? revenue / count : 0;
  const loyaltyRate = count > 0 ? (loyalCount / count) * 100 : 0;
  const subscriptionRate = count > 0 ? (subCount / count) * 100 : 0;
  
  // Header Stats
  document.getElementById('header-revenue').textContent = `$${revenue.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
  document.getElementById('header-rating').textContent = `${avgRating.toFixed(1)} ★`;
  
  // Dashboard KPIs
  document.getElementById('kpi-revenue').textContent = `$${revenue.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
  document.getElementById('kpi-transactions').textContent = count.toLocaleString();
  document.getElementById('kpi-aov').textContent = `$${aov.toFixed(2)}`;
  document.getElementById('kpi-loyalty').textContent = `${loyaltyRate.toFixed(1)}%`;
  document.getElementById('kpi-subscription').textContent = `${subscriptionRate.toFixed(1)}%`;
}

/**
 * 3. EVENT LISTENERS SETUP
 */
function setupEventListeners() {
  // Sidebar Navigation Links
  document.querySelectorAll('.sidebar-menu a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = link.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
  
  // Header "New Record" Button
  document.getElementById('btn-header-add').addEventListener('click', () => {
    resetForm();
    switchTab('webform');
  });
  
  // Filters Change Events
  document.getElementById('filter-gender').addEventListener('change', (e) => {
    state.filters.gender = e.target.value;
    updateApp();
  });
  document.getElementById('filter-category').addEventListener('change', (e) => {
    state.filters.category = e.target.value;
    updateApp();
  });
  document.getElementById('filter-season').addEventListener('change', (e) => {
    state.filters.season = e.target.value;
    updateApp();
  });
  document.getElementById('filter-subscription').addEventListener('change', (e) => {
    state.filters.subscription = e.target.value;
    updateApp();
  });
  
  // Dual Range Sliders
  const ageMinSlider = document.getElementById('filter-age-min');
  const ageMaxSlider = document.getElementById('filter-age-max');
  
  const handleAgeChange = () => {
    let min = parseInt(ageMinSlider.value);
    let max = parseInt(ageMaxSlider.value);
    
    if (min > max) {
      // Swap or keep apart
      const temp = min;
      min = max;
      max = temp;
    }
    
    state.filters.ageMin = min;
    state.filters.ageMax = max;
    document.getElementById('age-range-display').textContent = `${min} - ${max}`;
    updateApp();
  };
  
  ageMinSlider.addEventListener('input', handleAgeChange);
  ageMaxSlider.addEventListener('input', handleAgeChange);
  
  // Reset Filters Button
  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    document.getElementById('filter-gender').value = 'All';
    document.getElementById('filter-category').value = 'All';
    document.getElementById('filter-season').value = 'All';
    document.getElementById('filter-subscription').value = 'All';
    ageMinSlider.value = 18;
    ageMaxSlider.value = 70;
    
    state.filters = {
      gender: 'All',
      category: 'All',
      season: 'All',
      subscription: 'All',
      ageMin: 18,
      ageMax: 70
    };
    document.getElementById('age-range-display').textContent = '18 - 70';
    updateApp();
    showToast('Filters reset to default values', 'info');
  });
  
  // Data Explorer Search and Page Controls
  const searchInput = document.getElementById('explorer-search');
  searchInput.addEventListener('input', (e) => {
    state.explorerPagination.searchQuery = e.target.value;
    state.explorerPagination.currentPage = 1;
    renderExplorerTable();
  });
  
  document.getElementById('explorer-page-size').addEventListener('change', (e) => {
    state.explorerPagination.pageSize = parseInt(e.target.value);
    state.explorerPagination.currentPage = 1;
    renderExplorerTable();
  });
  
  document.getElementById('pagination-first').addEventListener('click', () => {
    state.explorerPagination.currentPage = 1;
    renderExplorerTable();
  });
  document.getElementById('pagination-prev').addEventListener('click', () => {
    if (state.explorerPagination.currentPage > 1) {
      state.explorerPagination.currentPage--;
      renderExplorerTable();
    }
  });
  document.getElementById('pagination-next').addEventListener('click', () => {
    const totalFilteredCount = getExplorerFilteredData().length;
    const maxPage = Math.ceil(totalFilteredCount / state.explorerPagination.pageSize);
    if (state.explorerPagination.currentPage < maxPage) {
      state.explorerPagination.currentPage++;
      renderExplorerTable();
    }
  });
  document.getElementById('pagination-last').addEventListener('click', () => {
    const totalFilteredCount = getExplorerFilteredData().length;
    const maxPage = Math.ceil(totalFilteredCount / state.explorerPagination.pageSize);
    state.explorerPagination.currentPage = maxPage || 1;
    renderExplorerTable();
  });
  
  // Table Sorting
  document.querySelectorAll('#data-explorer-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.getAttribute('data-sort');
      const currentSort = state.explorerPagination.sortBy;
      const currentOrder = state.explorerPagination.sortOrder;
      
      let newOrder = 'asc';
      if (currentSort === field) {
        newOrder = currentOrder === 'asc' ? 'desc' : 'asc';
      }
      
      state.explorerPagination.sortBy = field;
      state.explorerPagination.sortOrder = newOrder;
      
      // Update visual headers
      document.querySelectorAll('#data-explorer-table th').forEach(h => {
        h.classList.remove('asc', 'desc');
      });
      th.classList.add(newOrder);
      
      renderExplorerTable();
    });
  });
  
  // Export CSV Button
  document.getElementById('btn-export-csv').addEventListener('click', exportToCSV);
  
  // Multi-step Form Controls
  document.getElementById('form-category').addEventListener('change', (e) => {
    populateFormItemsDropdown(e.target.value);
  });
  
  // Star Rating Selector Logic
  const starSelector = document.getElementById('star-selector');
  const ratingInput = document.getElementById('form-rating');
  
  starSelector.querySelectorAll('.star-item').forEach(star => {
    star.addEventListener('mouseenter', () => {
      const rating = parseInt(star.getAttribute('data-rating'));
      highlightStars(rating, 'hover');
    });
    
    star.addEventListener('mouseleave', () => {
      const activeRating = parseInt(ratingInput.value) || 0;
      highlightStars(activeRating, 'active');
    });
    
    star.addEventListener('click', () => {
      const rating = parseInt(star.getAttribute('data-rating'));
      ratingInput.value = rating;
      highlightStars(rating, 'active');
      document.getElementById('err-rating-val').style.display = 'none';
    });
  });
  
  // Form Steps Buttons Navigation
  document.getElementById('btn-form-next').addEventListener('click', () => {
    if (validateStep(state.activeFormStep)) {
      setFormStep(state.activeFormStep + 1);
    }
  });
  
  document.getElementById('btn-form-prev').addEventListener('click', () => {
    setFormStep(state.activeFormStep - 1);
  });
  
  document.getElementById('btn-form-cancel').addEventListener('click', () => {
    resetForm();
    switchTab('dashboard');
  });
  
  // Submit Web Form
  document.getElementById('transaction-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (validateStep(state.activeFormStep)) {
      submitTransactionForm();
    }
  });
  
  // SQL Code Viewer Tab Switching
  document.querySelectorAll('.code-tabs .code-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.code-tabs .code-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const codeType = btn.getAttribute('data-code');
      state.activeCodeView = codeType;
      
      document.getElementById('code-sql').classList.toggle('active', codeType === 'sql');
      document.getElementById('code-js').classList.toggle('active', codeType === 'js');
    });
  });
  
  // Run SQL query button
  document.getElementById('btn-run-query').addEventListener('click', runSelectedQuery);
  
  // Modal Actions
  document.getElementById('btn-delete-cancel').addEventListener('click', () => {
    closeDeleteModal();
  });
  
  document.getElementById('btn-delete-confirm').addEventListener('click', confirmDeleteRecord);
}

/**
 * 4. TAB NAVIGATION
 */
function switchTab(tabId) {
  state.currentTab = tabId;
  
  // Toggle menu items
  document.querySelectorAll('.sidebar-menu a').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-tab') === tabId);
  });
  
  // Toggle contents panels
  document.querySelectorAll('.tab-content').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });
  
  // Update header descriptions depending on tab
  const title = document.getElementById('page-title');
  const subtitle = document.getElementById('page-subtitle');
  
  if (tabId === 'dashboard') {
    title.textContent = "Executive Analytics Dashboard";
    subtitle.textContent = "Real-time customer metrics and behavior profiles.";
  } else if (tabId === 'webform') {
    title.textContent = state.editingCustomerId ? "Modify Transaction Record" : "Data Ingestion Form";
    subtitle.textContent = state.editingCustomerId 
      ? `Updating data variables for Customer ID #${state.editingCustomerId}.` 
      : "Submit new transaction event logs into the database.";
  } else if (tabId === 'sqlhub') {
    title.textContent = "SQL Relational Hub";
    subtitle.textContent = "Simulating PostgreSQL analytical queries directly inside JS.";
    loadSqlQuery(state.activeSqlQueryIndex);
  } else if (tabId === 'explorer') {
    title.textContent = "Customer Ledger Explorer";
    subtitle.textContent = "A sortable, paginated record ledger of customer accounts.";
    renderExplorerTable();
  }
}

/**
 * 5. CHART.JS VISUALIZATIONS
 */
function renderCharts() {
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#94a3b8', font: { family: 'Outfit', size: 11 } }
      }
    },
    scales: {
      x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { family: 'Outfit' } } },
      y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { family: 'Outfit' } } }
    }
  };

  // Chart 1: Gender split
  state.charts.gender = new Chart(document.getElementById('chart-gender').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Male', 'Female'],
      datasets: [{
        data: [0, 0],
        backgroundColor: ['rgba(6, 182, 212, 0.7)', 'rgba(236, 72, 153, 0.7)'],
        borderColor: ['#06b6d4', '#ec4899'],
        borderWidth: 1.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Outfit' } } }
      },
      cutout: '65%'
    }
  });

  // Chart 2: Sales by Age Group
  state.charts.ageGroup = new Chart(document.getElementById('chart-age-group').getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Young Adult', 'Adult', 'Middle-aged', 'Senior'],
      datasets: [{
        label: 'Revenue (USD)',
        data: [0, 0, 0, 0],
        backgroundColor: 'rgba(139, 92, 246, 0.6)',
        borderColor: '#8b5cf6',
        borderWidth: 1
      }]
    },
    options: chartOptions
  });

  // Chart 3: Subscriber Comparison
  state.charts.subscriber = new Chart(document.getElementById('chart-subscriber').getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Subscribed', 'Not Subscribed'],
      datasets: [
        {
          label: 'Customer Count',
          data: [0, 0],
          backgroundColor: 'rgba(6, 182, 212, 0.5)',
          borderColor: '#06b6d4',
          borderWidth: 1,
          yAxisID: 'y'
        },
        {
          label: 'Total Revenue ($)',
          data: [0, 0],
          backgroundColor: 'rgba(236, 72, 153, 0.5)',
          borderColor: '#ec4899',
          borderWidth: 1,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'Outfit' } } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { family: 'Outfit' } } },
        y: {
          type: 'linear',
          position: 'left',
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' },
          title: { display: true, text: 'Customers count', color: '#94a3b8' }
        },
        y1: {
          type: 'linear',
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#94a3b8' },
          title: { display: true, text: 'Revenue (USD)', color: '#94a3b8' }
        }
      }
    }
  });

  // Chart 4: Top Rated Products
  state.charts.topProducts = new Chart(document.getElementById('chart-top-products').getContext('2d'), {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Average Review Rating',
        data: [],
        backgroundColor: 'rgba(245, 158, 11, 0.6)',
        borderColor: '#f59e0b',
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { min: 3.0, max: 5.0, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8' } },
        y: { ticks: { color: '#94a3b8', font: { family: 'Outfit' } } }
      }
    }
  });

  // Chart 5: Category Volume
  state.charts.category = new Chart(document.getElementById('chart-category').getContext('2d'), {
    type: 'polarArea',
    data: {
      labels: ['Clothing', 'Footwear', 'Outerwear', 'Accessories'],
      datasets: [{
        data: [0, 0, 0, 0],
        backgroundColor: [
          'rgba(139, 92, 246, 0.5)',
          'rgba(6, 182, 212, 0.5)',
          'rgba(236, 72, 153, 0.5)',
          'rgba(16, 185, 129, 0.5)'
        ],
        borderColor: ['#8b5cf6', '#06b6d4', '#ec4899', '#10b981'],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Outfit' } } }
      },
      scales: {
        r: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          angleLines: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { backdropColor: 'transparent', color: '#64748b' }
        }
      }
    }
  });

  // Chart 6: Customer Segmentation
  state.charts.segmentation = new Chart(document.getElementById('chart-segmentation').getContext('2d'), {
    type: 'pie',
    data: {
      labels: ['New', 'Returning', 'Loyal'],
      datasets: [{
        data: [0, 0, 0],
        backgroundColor: ['rgba(245, 158, 11, 0.6)', 'rgba(6, 182, 212, 0.6)', 'rgba(16, 185, 129, 0.6)'],
        borderColor: ['#f59e0b', '#06b6d4', '#10b981'],
        borderWidth: 1.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Outfit' } } }
      }
    }
  });

  // Chart 7: Discount Rate by Product
  state.charts.discountRate = new Chart(document.getElementById('chart-discount-rate').getContext('2d'), {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Discount Rate (%)',
        data: [],
        backgroundColor: 'rgba(236, 72, 153, 0.6)',
        borderColor: '#ec4899',
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { min: 0, max: 100, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8' } },
        y: { ticks: { color: '#94a3b8', font: { family: 'Outfit' } } }
      }
    }
  });
}

function updateChartsData(data) {
  if (data.length === 0) {
    // Zero empty state data to clear visual components
    for (const key in state.charts) {
      state.charts[key].data.datasets[0].data = [];
      state.charts[key].update();
    }
    return;
  }

  // 1. Gender Data
  let maleSpend = 0, femaleSpend = 0;
  data.forEach(item => {
    if (item.gender === 'Male') maleSpend += item.purchase_amount;
    else if (item.gender === 'Female') femaleSpend += item.purchase_amount;
  });
  state.charts.gender.data.datasets[0].data = [maleSpend, femaleSpend];
  state.charts.gender.update();

  // 2. Age group Data
  const ageSpend = { 'Young Adult': 0, 'Adult': 0, 'Middle-aged': 0, 'Senior': 0 };
  data.forEach(item => {
    if (ageSpend[item.age_group] !== undefined) {
      ageSpend[item.age_group] += item.purchase_amount;
    }
  });
  state.charts.ageGroup.data.datasets[0].data = [
    ageSpend['Young Adult'], ageSpend['Adult'], ageSpend['Middle-aged'], ageSpend['Senior']
  ];
  state.charts.ageGroup.update();

  // 3. Subscriber Comparison
  let subCount = 0, nosubCount = 0;
  let subRev = 0, nosubRev = 0;
  data.forEach(item => {
    if (item.subscription_status === 'Yes') {
      subCount++;
      subRev += item.purchase_amount;
    } else {
      nosubCount++;
      nosubRev += item.purchase_amount;
    }
  });
  state.charts.subscriber.data.datasets[0].data = [subCount, nosubCount];
  state.charts.subscriber.data.datasets[1].data = [subRev, nosubRev];
  state.charts.subscriber.update();

  // 4. Top Rated Products (Limit to top 5)
  // Calculate average rating per product item
  const productRatings = {};
  data.forEach(item => {
    productRatings[item.item_purchased] = productRatings[item.item_purchased] || { sum: 0, count: 0 };
    productRatings[item.item_purchased].sum += item.review_rating;
    productRatings[item.item_purchased].count++;
  });
  const avgProductRatings = Object.entries(productRatings).map(([name, r]) => ({
    name,
    avg: r.sum / r.count
  })).sort((a, b) => b.avg - a.avg).slice(0, 5);

  state.charts.topProducts.data.labels = avgProductRatings.map(p => p.name);
  state.charts.topProducts.data.datasets[0].data = avgProductRatings.map(p => p.avg);
  state.charts.topProducts.update();

  // 5. Category Distribution
  const catCount = { 'Clothing': 0, 'Footwear': 0, 'Outerwear': 0, 'Accessories': 0 };
  data.forEach(item => {
    if (catCount[item.category] !== undefined) {
      catCount[item.category]++;
    }
  });
  state.charts.category.data.datasets[0].data = [
    catCount['Clothing'], catCount['Footwear'], catCount['Outerwear'], catCount['Accessories']
  ];
  state.charts.category.update();

  // 6. Segmentation Data
  let newCount = 0, returningCount = 0, loyalCount = 0;
  data.forEach(item => {
    if (item.previous_purchases === 1) newCount++;
    else if (item.previous_purchases > 1 && item.previous_purchases <= 10) returningCount++;
    else loyalCount++;
  });
  state.charts.segmentation.data.datasets[0].data = [newCount, returningCount, loyalCount];
  state.charts.segmentation.update();

  // 7. Discount Rate by Product (Top 5)
  const productDiscount = {};
  data.forEach(item => {
    productDiscount[item.item_purchased] = productDiscount[item.item_purchased] || { discount: 0, total: 0 };
    productDiscount[item.item_purchased].total++;
    if (item.discount_applied === 'Yes') {
      productDiscount[item.item_purchased].discount++;
    }
  });
  const sortedDiscountRates = Object.entries(productDiscount).map(([name, val]) => ({
    name,
    rate: (val.discount / val.total) * 100
  })).sort((a, b) => b.rate - a.rate).slice(0, 5);

  state.charts.discountRate.data.labels = sortedDiscountRates.map(p => p.name);
  state.charts.discountRate.data.datasets[0].data = sortedDiscountRates.map(p => p.rate);
  state.charts.discountRate.update();
}

/**
 * 6. MULTI-STEP FORM VALIDATION & HANDLING
 */
function setFormStep(stepNum) {
  if (stepNum < 1 || stepNum > 3) return;
  state.activeFormStep = stepNum;
  
  // Update step indicators
  document.querySelectorAll('.step-indicator .step').forEach(step => {
    const s = parseInt(step.getAttribute('data-step'));
    step.classList.toggle('active', s === stepNum);
    step.classList.toggle('completed', s < stepNum);
  });
  
  // Toggle form panes
  document.querySelectorAll('.form-step-content').forEach(pane => {
    pane.classList.toggle('active', parseInt(pane.getAttribute('data-step')) === stepNum);
  });
  
  // Update navigation button states
  document.getElementById('btn-form-prev').disabled = (stepNum === 1);
  
  if (stepNum === 3) {
    document.getElementById('btn-form-next').style.display = 'none';
    document.getElementById('btn-form-submit').style.display = 'inline-flex';
  } else {
    document.getElementById('btn-form-next').style.display = 'inline-flex';
    document.getElementById('btn-form-submit').style.display = 'none';
  }
}

function highlightStars(rating, type) {
  const stars = document.getElementById('star-selector').querySelectorAll('.star-item');
  stars.forEach(star => {
    const sRating = parseInt(star.getAttribute('data-rating'));
    if (type === 'hover') {
      star.classList.toggle('hover', sRating <= rating);
    } else {
      star.classList.toggle('active', sRating <= rating);
    }
  });
}

function populateFormItemsDropdown(category, selectVal = "") {
  const itemSelect = document.getElementById('form-item-purchased');
  itemSelect.innerHTML = '<option value="" disabled selected>Select Item</option>';
  itemSelect.disabled = !category;
  
  if (category && categoryItemsMap[category]) {
    categoryItemsMap[category].forEach(item => {
      const opt = document.createElement('option');
      opt.value = item;
      opt.textContent = item;
      if (item === selectVal) opt.selected = true;
      itemSelect.appendChild(opt);
    });
  }
}

function validateStep(stepNum) {
  let isValid = true;
  
  const validateField = (id, errorId, validator) => {
    const el = document.getElementById(id);
    const errEl = document.getElementById(errorId);
    
    // Checkbox toggles don't throw errors
    if (!el || !errEl) return;
    
    const valid = validator(el.value);
    el.classList.toggle('is-invalid', !valid);
    errEl.style.display = valid ? 'none' : 'block';
    if (!valid) isValid = false;
  };
  
  if (stepNum === 1) {
    // Validate Age (18 - 70)
    validateField('form-age', 'err-age', (val) => {
      const num = parseInt(val);
      return !isNaN(num) && num >= 18 && num <= 70;
    });
    // Validate Gender
    validateField('form-gender', 'err-gender', (val) => !!val);
    // Validate Location
    validateField('form-location', 'err-location', (val) => !!val);
    // Validate Previous Purchases
    validateField('form-previous-purchases', 'err-prev-purchases', (val) => {
      const num = parseInt(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    });
  } else if (stepNum === 2) {
    // Validate Category
    validateField('form-category', 'err-form-category', (val) => !!val);
    // Validate Item Purchased
    validateField('form-item-purchased', 'err-item-purchased', (val) => !!val);
    // Validate Purchase Amount (10 - 500)
    validateField('form-purchase-amount', 'err-amount', (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 10 && num <= 500;
    });
    // Validate Payment Method
    validateField('form-payment-method', 'err-payment', (val) => !!val);
  } else if (stepNum === 3) {
    // Validate Size
    validateField('form-size', 'err-size', (val) => !!val);
    // Validate Color
    validateField('form-color', 'err-color', (val) => !!val);
    // Validate Season
    validateField('form-season', 'err-form-season', (val) => !!val);
    // Validate Shipping Type
    validateField('form-shipping', 'err-shipping', (val) => !!val);
    // Validate Frequency
    validateField('form-frequency', 'err-frequency', (val) => !!val);
    // Validate Rating Star
    validateField('form-rating', 'err-rating-val', (val) => {
      const num = parseInt(val);
      return !isNaN(num) && num >= 1 && num <= 5;
    });
  }
  
  return isValid;
}

function resetForm() {
  document.getElementById('transaction-form').reset();
  document.getElementById('form-customer-id').value = '';
  document.getElementById('form-rating').value = '';
  
  // Clear select dynamic items
  document.getElementById('form-item-purchased').innerHTML = '<option value="" disabled selected>Select Category First</option>';
  document.getElementById('form-item-purchased').disabled = true;
  
  // Remove error boundary styles
  document.querySelectorAll('.form-control-custom').forEach(el => el.classList.remove('is-invalid'));
  document.querySelectorAll('.error-msg').forEach(el => el.style.display = 'none');
  
  highlightStars(0, 'active');
  
  state.editingCustomerId = null;
  document.getElementById('form-badge-mode').textContent = "New Transaction";
  document.getElementById('form-badge-mode').style.backgroundColor = "var(--accent-purple-glow)";
  document.getElementById('form-badge-mode').style.color = "var(--accent-purple)";
  document.getElementById('form-title').textContent = "Customer Shopping Behavior Entry Form";
  
  setFormStep(1);
}

function submitTransactionForm() {
  const age = parseInt(document.getElementById('form-age').value);
  const gender = document.getElementById('form-gender').value;
  const location = document.getElementById('form-location').value;
  const previousPurchases = parseInt(document.getElementById('form-previous-purchases').value);
  const subStatus = document.getElementById('form-subscription').checked ? 'Yes' : 'No';
  const category = document.getElementById('form-category').value;
  const itemPurchased = document.getElementById('form-item-purchased').value;
  const amount = parseFloat(document.getElementById('form-purchase-amount').value);
  const paymentMethod = document.getElementById('form-payment-method').value;
  const discountApplied = document.getElementById('form-discount').checked ? 'Yes' : 'No';
  const size = document.getElementById('form-size').value;
  const color = document.getElementById('form-color').value;
  const season = document.getElementById('form-season').value;
  const shippingType = document.getElementById('form-shipping').value;
  const frequency = document.getElementById('form-frequency').value;
  const rating = parseInt(document.getElementById('form-rating').value);
  
  // Age Group Helper
  // Quartiles derived: Q25=31, Q50=44, Q75=57
  let ageGroup = 'Senior';
  if (age <= 31) ageGroup = 'Young Adult';
  else if (age <= 44) ageGroup = 'Adult';
  else if (age <= 57) ageGroup = 'Middle-aged';
  
  // Frequency Mapping
  const freqMap = {
    'Fortnightly': 14,
    'Weekly': 7,
    'Monthly': 30,
    'Quarterly': 90,
    'Bi-Weekly': 14,
    'Annually': 365,
    'Every 3 Months': 90
  };
  const freqDays = freqMap[frequency] || 30;

  const isEditing = !!state.editingCustomerId;
  let targetId;
  
  if (isEditing) {
    targetId = state.editingCustomerId;
    
    // Save to Edited records in LocalStorage
    const editedRecords = JSON.parse(localStorage.getItem(LS_EDITED_RECORDS) || '{}');
    const updateItem = {
      age, gender, location, previous_purchases: previousPurchases,
      subscription_status: subStatus, category, item_purchased: itemPurchased,
      purchase_amount: amount, payment_method: paymentMethod, discount_applied: discountApplied,
      size, color, season, shipping_type: shippingType, frequency_of_purchases: frequency,
      review_rating: rating, age_group: ageGroup, purchase_frequency_days: freqDays
    };
    
    editedRecords[targetId] = updateItem;
    localStorage.setItem(LS_EDITED_RECORDS, JSON.stringify(editedRecords));
    
    // Show Alert
    showToast(`Transaction Record #${targetId} updated successfully.`, 'success');
  } else {
    // Generate maximum ID
    const maxId = state.customers.reduce((max, c) => c.customer_id > max ? c.customer_id : max, 0);
    targetId = maxId + 1;
    
    const newItem = {
      customer_id: targetId,
      age, gender, location,
      previous_purchases: previousPurchases,
      subscription_status: subStatus,
      category,
      item_purchased: itemPurchased,
      purchase_amount: amount,
      payment_method: paymentMethod,
      discount_applied: discountApplied,
      size, color, season,
      shipping_type: shippingType,
      frequency_of_purchases: frequency,
      review_rating: rating,
      age_group: ageGroup,
      purchase_frequency_days: freqDays
    };
    
    // Save Custom records in LocalStorage
    const customRecords = JSON.parse(localStorage.getItem(LS_CUSTOM_RECORDS) || '[]');
    customRecords.push(newItem);
    localStorage.setItem(LS_CUSTOM_RECORDS, JSON.stringify(customRecords));
    
    // Show Alert
    showToast(`New Transaction Record #${targetId} added successfully.`, 'success');
  }
  
  // Reload and refresh
  loadDataset();
  resetForm();
  updateApp();
  switchTab('dashboard');
}

/**
 * 7. SQL QUERY SIMULATION HUB
 */
const sqlQueries = [
  {
    id: "Q1",
    title: "Total Revenue by Gender",
    desc: "Groups the customer dataset by gender and computes the total transaction purchase values.",
    sql: `SELECT gender,\n       SUM(purchase_amount) AS revenue\nFROM customer\nGROUP BY gender;`,
    js: `// Aggregate purchase amounts using Array.reduce\nconst results = Object.entries(\n  customers.reduce((acc, row) => {\n    acc[row.gender] = (acc[row.gender] || 0) + row.purchase_amount;\n    return acc;\n  }, {})\n).map(([gender, revenue]) => ({\n  Gender: gender,\n  Revenue: \`\$\${revenue.toFixed(2)}\`\n}));`,
    run: (data) => {
      const groups = data.reduce((acc, row) => {
        acc[row.gender] = (acc[row.gender] || 0) + row.purchase_amount;
        return acc;
      }, {});
      return Object.entries(groups).map(([gender, rev]) => ({
        'Gender': gender,
        'Revenue': `$${rev.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
      }));
    }
  },
  {
    id: "Q2",
    title: "Discounted Spend Above Average",
    desc: "Returns list of customer transactions where a discount was applied and the spend exceeds the database average.",
    sql: `SELECT customer_id,\n       purchase_amount \nFROM customer \nWHERE discount_applied = 'Yes'\n  AND purchase_amount >= (\n      SELECT AVG(purchase_amount) FROM customer\n  )\nLIMIT 10;`,
    js: `// Calculate average spend, then filter rows matching both sub-clauses\nconst avgSpend = customers.reduce((sum, c) => sum + c.purchase_amount, 0) / customers.length;\n\nconst results = customers\n  .filter(c => c.discount_applied === 'Yes' && c.purchase_amount >= avgSpend)\n  .slice(0, 10)\n  .map(c => ({\n    Customer_ID: c.customer_id,\n    Purchase_Amount: \`\$\${c.purchase_amount.toFixed(2)}\`\n  }));`,
    run: (data) => {
      const avg = data.reduce((sum, c) => sum + c.purchase_amount, 0) / data.length;
      return data
        .filter(c => c.discount_applied === 'Yes' && c.purchase_amount >= avg)
        .slice(0, 10)
        .map(c => ({
          'Customer ID': c.customer_id,
          'Purchase Amount': `$${c.purchase_amount.toFixed(2)}`,
          'Average Threshold': `$${avg.toFixed(2)}`
        }));
    }
  },
  {
    id: "Q3",
    title: "Top 5 Highly Rated Products",
    desc: "Groups by product item name, computes the average review rating, and filters for top 5 descending.",
    sql: `SELECT item_purchased,\n       ROUND(AVG(review_rating::numeric), 2) AS "Average Product Rating"\nFROM customer\nGROUP BY item_purchased\nORDER BY avg(review_rating) DESC\nLIMIT 5;`,
    js: `// Aggregate sum and count per item, compute average, sort descending\nconst items = {};\ncustomers.forEach(c => {\n  items[c.item_purchased] = items[c.item_purchased] || { sum: 0, cnt: 0 };\n  items[c.item_purchased].sum += c.review_rating;\n  items[c.item_purchased].cnt++;\n});\n\nconst results = Object.entries(items)\n  .map(([name, val]) => ({ name, avg: val.sum / val.cnt }))\n  .sort((a, b) => b.avg - a.avg)\n  .slice(0, 5);`,
    run: (data) => {
      const items = {};
      data.forEach(c => {
        items[c.item_purchased] = items[c.item_purchased] || { sum: 0, cnt: 0 };
        items[c.item_purchased].sum += c.review_rating;
        items[c.item_purchased].cnt++;
      });
      return Object.entries(items)
        .map(([name, val]) => ({
          'Item Purchased': name,
          'Average Product Rating': (val.sum / val.cnt).toFixed(2)
        }))
        .sort((a, b) => b['Average Product Rating'] - a['Average Product Rating'])
        .slice(0, 5);
    }
  },
  {
    id: "Q4",
    title: "Standard vs. Express Shipping Average",
    desc: "Compares average order purchase value between Standard and Express Shipping methods.",
    sql: `SELECT shipping_type,\n       ROUND(AVG(purchase_amount), 2) AS avg_amount\nFROM customer\nWHERE shipping_type IN ('Standard', 'Express')\nGROUP BY shipping_type;`,
    js: `// Filter for Standard or Express, reduce to calculate mean averages\nconst groups = customers\n  .filter(c => ['Standard', 'Express'].includes(c.shipping_type))\n  .reduce((acc, c) => {\n    acc[c.shipping_type] = acc[c.shipping_type] || { sum: 0, cnt: 0 };\n    acc[c.shipping_type].sum += c.purchase_amount;\n    acc[c.shipping_type].cnt++;\n    return acc;\n  }, {});`,
    run: (data) => {
      const groups = data
        .filter(c => ['Standard', 'Express'].includes(c.shipping_type))
        .reduce((acc, c) => {
          acc[c.shipping_type] = acc[c.shipping_type] || { sum: 0, cnt: 0 };
          acc[c.shipping_type].sum += c.purchase_amount;
          acc[c.shipping_type].cnt++;
          return acc;
        }, {});
      return Object.entries(groups).map(([ship, val]) => ({
        'Shipping Type': ship,
        'Average Spend': `$${(val.sum / val.cnt).toFixed(2)}`,
        'Total Transactions': val.cnt.toLocaleString()
      }));
    }
  },
  {
    id: "Q5",
    title: "Premium Subscriber Value Analysis",
    desc: "Compares customer volume, average order values, and overall revenues generated by active premium subscribers vs regular shoppers.",
    sql: `SELECT subscription_status,\n       COUNT(customer_id) AS total_customers,\n       ROUND(AVG(purchase_amount), 2) AS avg_spend,\n       ROUND(SUM(purchase_amount), 2) AS total_revenue\nFROM customer\nGROUP BY subscription_status\nORDER BY total_revenue DESC;`,
    js: `// Accumulate transaction logs grouped by subscription status boolean flag\nconst subMap = customers.reduce((acc, c) => {\n  const key = c.subscription_status;\n  acc[key] = acc[key] || { count: 0, sum: 0 };\n  acc[key].count++;\n  acc[key].sum += c.purchase_amount;\n  return acc;\n}, {});`,
    run: (data) => {
      const subMap = data.reduce((acc, c) => {
        const key = c.subscription_status === 'Yes' ? 'Subscriber' : 'Non-Subscriber';
        acc[key] = acc[key] || { count: 0, sum: 0 };
        acc[key].count++;
        acc[key].sum += c.purchase_amount;
        return acc;
      }, {});
      return Object.entries(subMap).map(([status, stats]) => ({
        'Subscription Status': status,
        'Total Customers': stats.count.toLocaleString(),
        'Avg Spend': `$${(stats.sum / stats.count).toFixed(2)}`,
        'Total Revenue': `$${stats.sum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
      })).sort((a, b) => parseFloat(b['Total Revenue'].replace(/[$,]/g, '')) - parseFloat(a['Total Revenue'].replace(/[$,]/g, '')));
    }
  },
  {
    id: "Q6",
    title: "Top 5 Products with Discount applied",
    desc: "Identifies the items with the highest percentage of discounted transactions relative to total purchases.",
    sql: `SELECT item_purchased,\n       ROUND(100.0 * SUM(CASE WHEN discount_applied = 'Yes' THEN 1 ELSE 0 END) / COUNT(*), 2) AS discount_rate\nFROM customer\nGROUP BY item_purchased\nORDER BY discount_rate DESC\nLIMIT 5;`,
    js: `// Calculate ratio of discount count over total count for each product name\nconst itemMap = {};\ncustomers.forEach(c => {\n  itemMap[c.item_purchased] = itemMap[c.item_purchased] || { disc: 0, tot: 0 };\n  itemMap[c.item_purchased].tot++;\n  if (c.discount_applied === 'Yes') itemMap[c.item_purchased].disc++;\n});\n\nconst rates = Object.entries(itemMap)\n  .map(([name, val]) => ({ name, rate: (val.disc / val.tot) * 100 }))\n  .sort((a, b) => b.rate - a.rate)\n  .slice(0, 5);`,
    run: (data) => {
      const itemMap = {};
      data.forEach(c => {
        itemMap[c.item_purchased] = itemMap[c.item_purchased] || { disc: 0, tot: 0 };
        itemMap[c.item_purchased].tot++;
        if (c.discount_applied === 'Yes') itemMap[c.item_purchased].disc++;
      });
      return Object.entries(itemMap)
        .map(([name, val]) => ({
          'Item Purchased': name,
          'Discount Rate': `${((val.disc / val.tot) * 100).toFixed(2)}%`,
          'Discounted Orders': val.disc,
          'Total Orders': val.tot
        }))
        .sort((a, b) => parseFloat(b['Discount Rate']) - parseFloat(a['Discount Rate']))
        .slice(0, 5);
    }
  },
  {
    id: "Q7",
    title: "Customer Segment Demographics",
    desc: "Categorizes customer ledger into New (1 purchase), Returning (2-10), and Loyal (>10) based on historical purchases count.",
    sql: `WITH customer_type AS (\n  SELECT customer_id,\n         CASE \n           WHEN previous_purchases = 1 THEN 'New'\n           WHEN previous_purchases BETWEEN 2 AND 10 THEN 'Returning'\n           ELSE 'Loyal'\n         END AS customer_segment\n  FROM customer\n)\nSELECT customer_segment,\n       COUNT(*) AS "Number of Customers" \nFROM customer_type \nGROUP BY customer_segment;`,
    js: `// Map each customer to a segment bucket, then aggregate counts\nconst counts = customers.reduce((acc, c) => {\n  let seg = 'Loyal';\n  if (c.previous_purchases === 1) seg = 'New';\n  else if (c.previous_purchases <= 10) seg = 'Returning';\n  \n  acc[seg] = (acc[seg] || 0) + 1;\n  return acc;\n}, {});`,
    run: (data) => {
      const counts = data.reduce((acc, c) => {
        let seg = 'Loyal';
        if (c.previous_purchases === 1) seg = 'New';
        else if (c.previous_purchases <= 10) seg = 'Returning';
        
        acc[seg] = (acc[seg] || 0) + 1;
        return acc;
      }, {});
      return Object.entries(counts).map(([segment, count]) => ({
        'Customer Segment': segment,
        'Number of Customers': count.toLocaleString(),
        'Percentage': `${((count / data.length) * 100).toFixed(1)}%`
      }));
    }
  },
  {
    id: "Q8",
    title: "Top 3 Products by Category",
    desc: "Extracts top 3 items based on total volumes sold within each category division using window ranking.",
    sql: `WITH item_counts AS (\n    SELECT category,\n           item_purchased,\n           COUNT(customer_id) AS total_orders,\n           ROW_NUMBER() OVER (PARTITION BY category ORDER BY COUNT(customer_id) DESC) AS item_rank\n    FROM customer\n    GROUP BY category, item_purchased\n)\nSELECT item_rank, category, item_purchased, total_orders\nFROM item_counts\nWHERE item_rank <= 3;`,
    js: `// Count item sales nested in category, sort items in category, slice top 3\nconst nested = {};\ncustomers.forEach(c => {\n  nested[c.category] = nested[c.category] || {};\n  nested[c.category][c.item_purchased] = (nested[c.category][c.item_purchased] || 0) + 1;\n});\n// Format and sort ranks...`,
    run: (data) => {
      const nested = {};
      data.forEach(c => {
        nested[c.category] = nested[c.category] || {};
        nested[c.category][c.item_purchased] = (nested[c.category][c.item_purchased] || 0) + 1;
      });
      
      const ranks = [];
      Object.entries(nested).forEach(([cat, items]) => {
        const sortedItems = Object.entries(items)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);
        
        sortedItems.slice(0, 3).forEach((item, idx) => {
          ranks.push({
            'Category': cat,
            'Rank': idx + 1,
            'Item Purchased': item.name,
            'Total Orders': item.count
          });
        });
      });
      return ranks;
    }
  },
  {
    id: "Q9",
    title: "Repeat Buyer subscription rate",
    desc: "Determines whether buyers with high repeat frequencies (>5 previous purchases) are subscribed.",
    sql: `SELECT subscription_status,\n       COUNT(customer_id) AS repeat_buyers\nFROM customer\nWHERE previous_purchases > 5\nGROUP BY subscription_status;`,
    js: `// Filter customers with purchases > 5, count grouped subscription_status\nconst results = Object.entries(\n  customers\n    .filter(c => c.previous_purchases > 5)\n    .reduce((acc, c) => {\n      acc[c.subscription_status] = (acc[c.subscription_status] || 0) + 1;\n      return acc;\n    }, {})\n).map(([status, count]) => ({ subscription_status: status, repeat_buyers: count }));`,
    run: (data) => {
      const repeatData = data.filter(c => c.previous_purchases > 5);
      const groups = repeatData.reduce((acc, c) => {
        const key = c.subscription_status === 'Yes' ? 'Subscribed' : 'Not Subscribed';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      return Object.entries(groups).map(([status, count]) => ({
        'Subscription Status': status,
        'Repeat Buyers Count': count.toLocaleString(),
        'Percentage of Repeat Buyers': `${((count / repeatData.length) * 100).toFixed(1)}%`
      }));
    }
  },
  {
    id: "Q10",
    title: "Age Group Revenue Contribution",
    desc: "Calculates total sales generated within each categorized age demographic group.",
    sql: `SELECT age_group,\n       SUM(purchase_amount) AS total_revenue\nFROM customer\nGROUP BY age_group\nORDER BY total_revenue DESC;`,
    js: `// Accumulate purchase revenue partitioned by age group label\nconst results = Object.entries(\n  customers.reduce((acc, c) => {\n    acc[c.age_group] = (acc[c.age_group] || 0) + c.purchase_amount;\n    return acc;\n  }, {})\n).map(([age_group, total_revenue]) => ({\n  Age_Group: age_group,\n  Total_Revenue: total_revenue\n})).sort((a,b) => b.Total_Revenue - a.Total_Revenue);`,
    run: (data) => {
      const groups = data.reduce((acc, c) => {
        acc[c.age_group] = (acc[c.age_group] || 0) + c.purchase_amount;
        return acc;
      }, {});
      return Object.entries(groups).map(([ageGroup, rev]) => ({
        'Age Cohort': ageGroup,
        'Total Revenue': `$${rev.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
      })).sort((a, b) => parseFloat(b['Total Revenue'].replace(/[$,]/g, '')) - parseFloat(a['Total Revenue'].replace(/[$,]/g, '')));
    }
  }
];

function populateSqlQueriesMenu() {
  const menuContainer = document.getElementById('sql-query-menu');
  menuContainer.innerHTML = '';
  
  sqlQueries.forEach((q, idx) => {
    const btn = document.createElement('button');
    btn.className = `sql-menu-btn ${idx === 0 ? 'active' : ''}`;
    btn.setAttribute('data-index', idx);
    
    btn.innerHTML = `
      <span class="q-num">${q.id}</span>
      <span class="q-title" title="${q.title}">${q.title}</span>
    `;
    
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sql-menu-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeSqlQueryIndex = idx;
      loadSqlQuery(idx);
    });
    
    menuContainer.appendChild(btn);
  });
}

function loadSqlQuery(idx) {
  const q = sqlQueries[idx];
  
  document.getElementById('sql-badge').textContent = `QUERY ${q.id}`;
  document.getElementById('sql-title').textContent = q.title;
  document.getElementById('sql-description').textContent = q.desc;
  
  // Update code content
  document.getElementById('code-sql').innerHTML = `<code class="language-sql">${highlightSQL(q.sql)}</code>`;
  document.getElementById('code-js').innerHTML = `<code class="language-javascript">${highlightJS(q.js)}</code>`;
  
  // Clear outputs
  const headerTr = document.getElementById('sql-results-header');
  const body = document.getElementById('sql-results-body');
  
  headerTr.innerHTML = '<th>Column</th>';
  body.innerHTML = `
    <tr>
      <td class="empty-state">Click "Run Query on Dataset" to process this code block client-side.</td>
    </tr>
  `;
  document.getElementById('query-run-time').style.display = 'none';
}

function runSelectedQuery() {
  const q = sqlQueries[state.activeSqlQueryIndex];
  
  // Execute and time it
  const start = performance.now();
  const outputData = q.run(state.customers);
  const end = performance.now();
  const duration = (end - start).toFixed(3);
  
  // Update execute time label
  const timeLabel = document.getElementById('query-run-time');
  timeLabel.style.display = 'inline-block';
  timeLabel.textContent = `Executed in ${duration} ms`;
  
  // Render results
  const headerTr = document.getElementById('sql-results-header');
  const body = document.getElementById('sql-results-body');
  
  if (outputData.length === 0) {
    headerTr.innerHTML = '<th>Output</th>';
    body.innerHTML = '<tr><td class="empty-state">No matching records found.</td></tr>';
    return;
  }
  
  // Populate headers
  const columns = Object.keys(outputData[0]);
  headerTr.innerHTML = '';
  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    headerTr.appendChild(th);
  });
  
  // Populate rows
  body.innerHTML = '';
  outputData.forEach(row => {
    const tr = document.createElement('tr');
    columns.forEach(col => {
      const td = document.createElement('td');
      td.textContent = row[col];
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  
  showToast(`Query ${q.id} executed on ${state.customers.length.toLocaleString()} rows.`, 'success');
}

// SQL Syntax Highlighter Helper
function highlightSQL(code) {
  const keywords = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'SUM', 'AVG', 'COUNT', 'ROUND', 'AND', 'IN', 'WITH', 'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'OVER', 'PARTITION BY', 'DESC', 'numeric', 'ASC'];
  let html = code;
  
  // Strings
  html = html.replace(/(['"])(.*?)\1/g, '<span class="string">\'$2\'</span>');
  
  // Keywords
  keywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'g');
    html = html.replace(regex, `<span class="keyword">${kw}</span>`);
  });
  
  // Functions
  html = html.replace(/\b(ROUND|SUM|AVG|COUNT|ROW_NUMBER)\(/g, '<span class="function">$1</span>(');
  
  return html;
}

// JS Syntax Highlighter Helper
function highlightJS(code) {
  const keywords = ['const', 'let', 'var', 'return', 'if', 'else', 'for', 'forEach', 'reduce', 'filter', 'map', 'sort', 'slice', 'includes'];
  let html = code;
  
  // Comments
  html = html.replace(/(\/\/.*?$)/gm, '<span class="comment">$1</span>');
  
  // Keywords
  keywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'g');
    html = html.replace(regex, `<span class="keyword">${kw}</span>`);
  });
  
  // Strings
  html = html.replace(/(['"`])(.*?)\1/g, '<span class="string">`$2`</span>');
  
  // Numbers
  html = html.replace(/\b(\d+)\b/g, '<span class="number">$1</span>');
  
  return html;
}

/**
 * 8. DATA EXPLORER & PAGINATED DATA GRID
 */
function getExplorerFilteredData() {
  const q = state.explorerPagination.searchQuery.toLowerCase().trim();
  
  let data = [...state.customers];
  
  // Search filter
  if (q) {
    data = data.filter(c => {
      return (
        c.customer_id.toString().includes(q) ||
        c.age.toString().includes(q) ||
        c.gender.toLowerCase().includes(q) ||
        c.item_purchased.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.purchase_amount.toString().includes(q) ||
        c.location.toLowerCase().includes(q) ||
        c.color.toLowerCase().includes(q)
      );
    });
  }
  
  // Sort
  const field = state.explorerPagination.sortBy;
  const isAsc = state.explorerPagination.sortOrder === 'asc';
  
  data.sort((a, b) => {
    let valA = a[field];
    let valB = b[field];
    
    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }
    
    if (valA < valB) return isAsc ? -1 : 1;
    if (valA > valB) return isAsc ? 1 : -1;
    return 0;
  });
  
  return data;
}

function renderExplorerTable() {
  const data = getExplorerFilteredData();
  const count = data.length;
  
  const pg = state.explorerPagination;
  const totalPages = Math.ceil(count / pg.pageSize) || 1;
  
  // Bound current page
  if (pg.currentPage > totalPages) pg.currentPage = totalPages;
  if (pg.currentPage < 1) pg.currentPage = 1;
  
  // Slice page
  const startIdx = (pg.currentPage - 1) * pg.pageSize;
  const endIdx = Math.min(startIdx + pg.pageSize, count);
  const pageData = data.slice(startIdx, endIdx);
  
  const tbody = document.getElementById('explorer-table-body');
  tbody.innerHTML = '';
  
  if (pageData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="empty-state">No matching records found. Use the search bar to refine query.</td>
      </tr>
    `;
    // Update pagination labels
    document.getElementById('pagination-info').textContent = 'Showing 0 of 0 entries';
    document.getElementById('pagination-current-page').textContent = '1 / 1';
    togglePaginationButtons(1, 1);
    return;
  }
  
  // Populate Rows
  pageData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>#${row.customer_id}</strong></td>
      <td>${row.age}</td>
      <td><span class="badge badge-gender-${row.gender.toLowerCase()}">${row.gender}</span></td>
      <td>${row.item_purchased}</td>
      <td>${row.category}</td>
      <td><strong>$${row.purchase_amount.toFixed(0)}</strong></td>
      <td>${row.location}</td>
      <td>${row.review_rating.toFixed(1)} ★</td>
      <td><span class="badge badge-sub-${row.subscription_status.toLowerCase()}">${row.subscription_status}</span></td>
      <td>${row.discount_applied}</td>
      <td>${row.previous_purchases}</td>
      <td>
        <div class="table-actions">
          <button class="btn-icon-sm edit" onclick="editRecord(${row.customer_id})" title="Edit Record">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="btn-icon-sm delete" onclick="deleteRecord(${row.customer_id})" title="Delete Record">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  // Refresh icons
  lucide.createIcons();
  
  // Update Page Labels
  document.getElementById('pagination-info').textContent = `Showing ${startIdx + 1} to ${endIdx} of ${count.toLocaleString()} entries`;
  document.getElementById('pagination-current-page').textContent = `${pg.currentPage} / ${totalPages}`;
  
  // Set button disabled states
  togglePaginationButtons(pg.currentPage, totalPages);
}

function togglePaginationButtons(curr, total) {
  document.getElementById('pagination-first').disabled = (curr === 1);
  document.getElementById('pagination-prev').disabled = (curr === 1);
  document.getElementById('pagination-next').disabled = (curr === total);
  document.getElementById('pagination-last').disabled = (curr === total);
}

// Global functions for inline actions (Edit & Delete)
window.editRecord = (id) => {
  const item = state.customers.find(c => c.customer_id === id);
  if (!item) return;
  
  resetForm();
  
  state.editingCustomerId = id;
  document.getElementById('form-customer-id').value = id;
  document.getElementById('form-badge-mode').textContent = `Edit Transaction #${id}`;
  document.getElementById('form-badge-mode').style.backgroundColor = "rgba(6, 182, 212, 0.1)";
  document.getElementById('form-badge-mode').style.color = "var(--accent-cyan)";
  document.getElementById('form-title').textContent = "Modify Historical Customer Transaction";
  
  // Populate Form Fields
  document.getElementById('form-age').value = item.age;
  document.getElementById('form-gender').value = item.gender;
  document.getElementById('form-location').value = item.location;
  document.getElementById('form-previous-purchases').value = item.previous_purchases;
  document.getElementById('form-subscription').checked = (item.subscription_status === 'Yes');
  document.getElementById('form-category').value = item.category;
  
  populateFormItemsDropdown(item.category, item.item_purchased);
  
  document.getElementById('form-purchase-amount').value = item.purchase_amount;
  document.getElementById('form-payment-method').value = item.payment_method;
  document.getElementById('form-discount').checked = (item.discount_applied === 'Yes');
  
  document.getElementById('form-size').value = item.size;
  document.getElementById('form-color').value = item.color;
  document.getElementById('form-season').value = item.season;
  document.getElementById('form-shipping').value = item.shipping_type;
  document.getElementById('form-frequency').value = item.frequency_of_purchases;
  
  // Rating Star
  document.getElementById('form-rating').value = item.review_rating;
  highlightStars(item.review_rating, 'active');
  
  switchTab('webform');
};

let recordToDeleteId = null;

window.deleteRecord = (id) => {
  recordToDeleteId = id;
  document.getElementById('delete-modal-cust-id').textContent = id;
  document.getElementById('delete-modal').classList.add('active');
};

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('active');
  recordToDeleteId = null;
}

function confirmDeleteRecord() {
  if (recordToDeleteId === null) return;
  
  const id = recordToDeleteId;
  
  // Check if it is a custom added record
  const customRecords = JSON.parse(localStorage.getItem(LS_CUSTOM_RECORDS) || '[]');
  const isCustom = customRecords.some(r => r.customer_id === id);
  
  if (isCustom) {
    const updatedCustom = customRecords.filter(r => r.customer_id !== id);
    localStorage.setItem(LS_CUSTOM_RECORDS, JSON.stringify(updatedCustom));
  } else {
    // Regular initial dataset record, add to Deleted list
    const deletedIds = JSON.parse(localStorage.getItem(LS_DELETED_IDS) || '[]');
    deletedIds.push(id);
    localStorage.setItem(LS_DELETED_IDS, JSON.stringify(deletedIds));
  }
  
  // Clear edits if any
  const editedRecords = JSON.parse(localStorage.getItem(LS_EDITED_RECORDS) || '{}');
  if (editedRecords[id]) {
    delete editedRecords[id];
    localStorage.setItem(LS_EDITED_RECORDS, JSON.stringify(editedRecords));
  }
  
  closeDeleteModal();
  showToast(`Record #${id} permanently deleted.`, 'danger');
  
  // Reload dataset and update UI
  loadDataset();
  updateApp();
}

/**
 * 9. TOAST NOTIFICATIONS & CSV EXPORTER
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconName = 'check-circle';
  if (type === 'danger') iconName = 'alert-triangle';
  if (type === 'info') iconName = 'info';
  
  toast.innerHTML = `
    <div class="toast-icon">
      <i data-lucide="${iconName}"></i>
    </div>
    <div class="toast-body">
      <span class="toast-title">${type.toUpperCase()}</span>
      <span class="toast-message">${message}</span>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <i data-lucide="x"></i>
    </button>
  `;
  
  container.appendChild(toast);
  lucide.createIcons();
  
  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.style.animation = 'toastSlideIn 0.3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function exportToCSV() {
  const data = getExplorerFilteredData();
  if (data.length === 0) {
    showToast('No records available to export', 'danger');
    return;
  }
  
  // Build header row
  const headers = Object.keys(data[0]);
  let csvContent = headers.join(',') + '\n';
  
  // Build data rows
  data.forEach(row => {
    const values = headers.map(header => {
      let val = row[header];
      // Escape commas and quotes
      if (typeof val === 'string') {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    csvContent += values.join(',') + '\n';
  });
  
  // Create download link
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `customer_behavior_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast(`Successfully exported ${data.length.toLocaleString()} records to CSV.`, 'success');
}
