(function () {
  'use strict';

  // ── Storage keys ──
  const STORAGE_KEY = 'food_tracker_entries';
  const TARGETS_KEY = 'food_tracker_targets';
  const MY_FOODS_KEY = 'food_tracker_my_foods';

  const defaultTargets = { calories: 2000, protein: 150, carbs: 250, fat: 65, fiber: 30 };

  // ── Firebase references (set after init) ──
  let db = null;
  let firebaseReady = false;

  function initFirebase() {
    try {
      if (typeof firebaseConfig === 'undefined' || !firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
        console.warn('Firebase not configured — running in local-only mode.');
        setSyncStatus('local');
        return;
      }
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      // Enable offline persistence
      db.enablePersistence({ synchronizeTabs: true }).catch(err => {
        if (err.code === 'failed-precondition') {
          console.warn('Firestore persistence failed: multiple tabs open');
        } else if (err.code === 'unimplemented') {
          console.warn('Firestore persistence not available in this browser');
        }
      });
      firebaseReady = true;
      setSyncStatus('syncing');
      // Start real-time listeners
      listenEntries();
      listenMyFoods();
      listenTargets();
    } catch (e) {
      console.error('Firebase init error:', e);
      setSyncStatus('local');
    }
  }

  // ── Sync status indicator ──
  function setSyncStatus(status) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    const labels = { synced: '● Synced', syncing: '◌ Syncing…', local: '○ Local only', error: '✕ Sync error' };
    el.className = 'sync-status sync-' + status;
    el.textContent = labels[status] || status;
  }

  // ── LocalStorage helpers ──
  function loadLocal(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
  }
  function saveLocal(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  let entries = loadLocal(STORAGE_KEY, []);
  let targets = { ...defaultTargets, ...loadLocal(TARGETS_KEY, {}) };
  let myFoods = loadLocal(MY_FOODS_KEY, []);

  // ── Firebase: entries real-time sync ──
  function listenEntries() {
    if (!db) return;
    db.collection('entries').orderBy('date', 'desc').onSnapshot(snap => {
      entries = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      saveLocal(STORAGE_KEY, entries);
      setSyncStatus('synced');
      refresh();
    }, err => {
      console.error('Entries listener error:', err);
      setSyncStatus('error');
    });
  }

  function addEntryToFirebase(entry) {
    if (!db) return;
    const { id, ...data } = entry;
    db.collection('entries').doc(id).set(data).catch(err => {
      console.error('Error saving entry:', err);
      setSyncStatus('error');
    });
  }

  function deleteEntryFromFirebase(id) {
    if (!db) return;
    db.collection('entries').doc(id).delete().catch(err => {
      console.error('Error deleting entry:', err);
    });
  }

  // ── Firebase: my foods real-time sync ──
  function listenMyFoods() {
    if (!db) return;
    db.collection('myFoods').orderBy('_lastUsed', 'desc').onSnapshot(snap => {
      myFoods = snap.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
      saveLocal(MY_FOODS_KEY, myFoods);
    }, err => console.error('My Foods listener error:', err));
  }

  function saveMyFoodToFirebase(food) {
    if (!db) return;
    const key = food.name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    db.collection('myFoods').doc(key).set(food).catch(err => {
      console.error('Error saving my food:', err);
    });
  }

  // ── Firebase: targets real-time sync ──
  function listenTargets() {
    if (!db) return;
    db.collection('settings').doc('targets').onSnapshot(doc => {
      if (doc.exists) {
        targets = { ...defaultTargets, ...doc.data() };
        saveLocal(TARGETS_KEY, targets);
        refresh();
      }
    }, err => console.error('Targets listener error:', err));
  }

  function saveTargetsToFirebase(t) {
    if (!db) return;
    db.collection('settings').doc('targets').set(t).catch(err => {
      console.error('Error saving targets:', err);
    });
  }

  // ── Local-only storage helpers (used when Firebase is not configured) ──
  function saveEntries() {
    saveLocal(STORAGE_KEY, entries);
  }

  function saveTargetsLocal() {
    saveLocal(TARGETS_KEY, targets);
  }

  // ── My Foods (local operations) ──
  function addToMyFoods(entry) {
    const key = entry.name.toLowerCase().trim();
    const idx = myFoods.findIndex(f => f.name.toLowerCase().trim() === key);
    const food = {
      name: entry.name,
      serving: entry.serving || '',
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
      fiber: entry.fiber,
      _custom: true,
      _lastUsed: Date.now(),
    };
    if (idx >= 0) {
      myFoods[idx] = food;
    } else {
      myFoods.unshift(food);
    }
    saveLocal(MY_FOODS_KEY, myFoods);
    saveMyFoodToFirebase(food);
  }

  function searchMyFoods(query) {
    const q = query.toLowerCase();
    return myFoods
      .filter(f => f.name.toLowerCase().includes(q))
      .sort((a, b) => (b._lastUsed || 0) - (a._lastUsed || 0))
      .slice(0, 6);
  }

  // ── Date helpers ──
  function localDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function todayStr() { return localDateStr(new Date()); }
  function nowTime() { return new Date().toTimeString().slice(0, 5); }
  function dayName(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
  }
  function formatDate(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function last7Days() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(localDateStr(d));
    }
    return days;
  }

  // ── Built-in food database (per typical serving) ──
  const FOOD_DB = [
    // Proteins
    { name: 'Chicken breast (grilled)', serving: '150g', calories: 248, protein: 46, carbs: 0, fat: 5.4, fiber: 0 },
    { name: 'Chicken thigh (grilled)', serving: '150g', calories: 318, protein: 37, carbs: 0, fat: 18, fiber: 0 },
    { name: 'Salmon fillet', serving: '150g', calories: 312, protein: 34, carbs: 0, fat: 18.6, fiber: 0 },
    { name: 'Tuna (canned in water)', serving: '1 can (140g)', calories: 144, protein: 33, carbs: 0, fat: 1, fiber: 0 },
    { name: 'Shrimp', serving: '150g', calories: 144, protein: 28, carbs: 1.5, fat: 2.4, fiber: 0 },
    { name: 'Tilapia fillet', serving: '150g', calories: 162, protein: 34, carbs: 0, fat: 3, fiber: 0 },
    { name: 'Ground beef (85% lean)', serving: '150g', calories: 332, protein: 32, carbs: 0, fat: 22, fiber: 0 },
    { name: 'Ground turkey', serving: '150g', calories: 254, protein: 30, carbs: 0, fat: 15, fiber: 0 },
    { name: 'Steak (sirloin)', serving: '200g', calories: 374, protein: 46, carbs: 0, fat: 20, fiber: 0 },
    { name: 'Pork chop', serving: '150g', calories: 297, protein: 36, carbs: 0, fat: 16, fiber: 0 },
    { name: 'Bacon', serving: '3 slices (30g)', calories: 129, protein: 9, carbs: 0.4, fat: 10, fiber: 0 },
    { name: 'Turkey breast (deli)', serving: '100g', calories: 104, protein: 18, carbs: 3, fat: 2, fiber: 0 },
    { name: 'Tofu (firm)', serving: '150g', calories: 132, protein: 15, carbs: 3, fat: 7.5, fiber: 0.6 },
    { name: 'Tempeh', serving: '100g', calories: 192, protein: 20, carbs: 8, fat: 11, fiber: 0 },
    { name: 'Eggs (whole)', serving: '2 large', calories: 156, protein: 12, carbs: 1.2, fat: 10.6, fiber: 0 },
    { name: 'Egg whites', serving: '4 large', calories: 68, protein: 14.4, carbs: 0.8, fat: 0.4, fiber: 0 },
    { name: 'Lamb chop', serving: '150g', calories: 360, protein: 36, carbs: 0, fat: 24, fiber: 0 },

    // Dairy
    { name: 'Greek yogurt (plain, nonfat)', serving: '1 cup (245g)', calories: 133, protein: 23, carbs: 8, fat: 0.7, fiber: 0 },
    { name: 'Greek yogurt (full fat)', serving: '1 cup (245g)', calories: 220, protein: 20, carbs: 9, fat: 11, fiber: 0 },
    { name: 'Milk (whole)', serving: '1 cup (240ml)', calories: 149, protein: 8, carbs: 12, fat: 8, fiber: 0 },
    { name: 'Milk (2%)', serving: '1 cup (240ml)', calories: 122, protein: 8, carbs: 12, fat: 5, fiber: 0 },
    { name: 'Milk (skim)', serving: '1 cup (240ml)', calories: 83, protein: 8, carbs: 12, fat: 0.2, fiber: 0 },
    { name: 'Cheddar cheese', serving: '30g', calories: 120, protein: 7, carbs: 0.4, fat: 10, fiber: 0 },
    { name: 'Mozzarella cheese', serving: '30g', calories: 85, protein: 6, carbs: 0.7, fat: 6, fiber: 0 },
    { name: 'Cottage cheese (low fat)', serving: '1 cup (226g)', calories: 183, protein: 28, carbs: 6, fat: 5, fiber: 0 },
    { name: 'Paneer', serving: '100g', calories: 265, protein: 18, carbs: 1.2, fat: 21, fiber: 0 },
    { name: 'Butter', serving: '1 tbsp (14g)', calories: 102, protein: 0.1, carbs: 0, fat: 11.5, fiber: 0 },

    // Grains & carbs
    { name: 'White rice (cooked)', serving: '1 cup (186g)', calories: 242, protein: 4.4, carbs: 53, fat: 0.4, fiber: 0.6 },
    { name: 'Brown rice (cooked)', serving: '1 cup (195g)', calories: 216, protein: 5, carbs: 45, fat: 1.8, fiber: 3.5 },
    { name: 'Quinoa (cooked)', serving: '1 cup (185g)', calories: 222, protein: 8, carbs: 39, fat: 3.5, fiber: 5 },
    { name: 'Oats (dry)', serving: '1/2 cup (40g)', calories: 154, protein: 5, carbs: 27, fat: 2.6, fiber: 4 },
    { name: 'Oatmeal (cooked)', serving: '1 cup (234g)', calories: 154, protein: 5.4, carbs: 27, fat: 2.6, fiber: 4 },
    { name: 'Pasta (cooked)', serving: '1 cup (140g)', calories: 220, protein: 8, carbs: 43, fat: 1.3, fiber: 2.5 },
    { name: 'Whole wheat bread', serving: '1 slice (36g)', calories: 91, protein: 4, carbs: 15, fat: 1.5, fiber: 2 },
    { name: 'White bread', serving: '1 slice (30g)', calories: 79, protein: 2.7, carbs: 15, fat: 1, fiber: 0.6 },
    { name: 'Tortilla (flour)', serving: '1 large', calories: 218, protein: 5.5, carbs: 36, fat: 5.5, fiber: 2 },
    { name: 'Tortilla (corn)', serving: '1 medium', calories: 52, protein: 1.4, carbs: 11, fat: 0.7, fiber: 1.5 },
    { name: 'Naan bread', serving: '1 piece (90g)', calories: 262, protein: 8.7, carbs: 45, fat: 5.1, fiber: 2 },
    { name: 'Bagel (plain)', serving: '1 medium', calories: 270, protein: 10, carbs: 53, fat: 1.5, fiber: 2 },
    { name: 'Sweet potato', serving: '1 medium (130g)', calories: 112, protein: 2, carbs: 26, fat: 0.1, fiber: 3.9 },
    { name: 'Potato (baked)', serving: '1 medium (173g)', calories: 161, protein: 4.3, carbs: 37, fat: 0.2, fiber: 3.8 },
    { name: 'Couscous (cooked)', serving: '1 cup (157g)', calories: 176, protein: 6, carbs: 36, fat: 0.3, fiber: 2.2 },

    // Fruits
    { name: 'Banana', serving: '1 medium (118g)', calories: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3.1 },
    { name: 'Apple', serving: '1 medium (182g)', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, fiber: 4.4 },
    { name: 'Orange', serving: '1 medium (131g)', calories: 62, protein: 1.2, carbs: 15, fat: 0.2, fiber: 3.1 },
    { name: 'Strawberries', serving: '1 cup (144g)', calories: 46, protein: 1, carbs: 11, fat: 0.4, fiber: 2.9 },
    { name: 'Blueberries', serving: '1 cup (148g)', calories: 84, protein: 1.1, carbs: 21, fat: 0.5, fiber: 3.6 },
    { name: 'Grapes', serving: '1 cup (151g)', calories: 104, protein: 1.1, carbs: 27, fat: 0.2, fiber: 1.4 },
    { name: 'Mango', serving: '1 cup (165g)', calories: 99, protein: 1.4, carbs: 25, fat: 0.6, fiber: 2.6 },
    { name: 'Avocado', serving: '1/2 medium (68g)', calories: 114, protein: 1.3, carbs: 6, fat: 10.5, fiber: 4.6 },
    { name: 'Watermelon', serving: '1 cup (152g)', calories: 46, protein: 0.9, carbs: 12, fat: 0.2, fiber: 0.6 },
    { name: 'Pineapple', serving: '1 cup (165g)', calories: 82, protein: 0.9, carbs: 22, fat: 0.2, fiber: 2.3 },

    // Vegetables
    { name: 'Broccoli (cooked)', serving: '1 cup (156g)', calories: 55, protein: 3.7, carbs: 11, fat: 0.6, fiber: 5.1 },
    { name: 'Spinach (cooked)', serving: '1 cup (180g)', calories: 41, protein: 5.3, carbs: 7, fat: 0.5, fiber: 4.3 },
    { name: 'Spinach (raw)', serving: '2 cups (60g)', calories: 14, protein: 1.7, carbs: 2.2, fat: 0.2, fiber: 1.3 },
    { name: 'Kale (cooked)', serving: '1 cup (130g)', calories: 36, protein: 2.5, carbs: 7, fat: 0.5, fiber: 2.6 },
    { name: 'Carrots', serving: '1 medium (61g)', calories: 25, protein: 0.6, carbs: 6, fat: 0.1, fiber: 1.7 },
    { name: 'Bell pepper', serving: '1 medium (119g)', calories: 31, protein: 1, carbs: 7, fat: 0.3, fiber: 2.1 },
    { name: 'Tomato', serving: '1 medium (123g)', calories: 22, protein: 1.1, carbs: 4.8, fat: 0.2, fiber: 1.5 },
    { name: 'Cucumber', serving: '1 cup (104g)', calories: 16, protein: 0.7, carbs: 3.1, fat: 0.2, fiber: 0.5 },
    { name: 'Mixed salad greens', serving: '2 cups (85g)', calories: 18, protein: 1.5, carbs: 3.5, fat: 0.2, fiber: 1.5 },
    { name: 'Corn (cooked)', serving: '1 ear (90g)', calories: 88, protein: 3, carbs: 19, fat: 1.4, fiber: 2 },
    { name: 'Green beans (cooked)', serving: '1 cup (125g)', calories: 44, protein: 2.4, carbs: 10, fat: 0.4, fiber: 4 },
    { name: 'Cauliflower (cooked)', serving: '1 cup (124g)', calories: 29, protein: 2.3, carbs: 5.1, fat: 0.6, fiber: 2.9 },

    // Legumes & nuts
    { name: 'Black beans (cooked)', serving: '1 cup (172g)', calories: 227, protein: 15, carbs: 41, fat: 0.9, fiber: 15 },
    { name: 'Chickpeas (cooked)', serving: '1 cup (164g)', calories: 269, protein: 14.5, carbs: 45, fat: 4.2, fiber: 12.5 },
    { name: 'Lentils (cooked)', serving: '1 cup (198g)', calories: 230, protein: 18, carbs: 40, fat: 0.8, fiber: 15.6 },
    { name: 'Kidney beans (cooked)', serving: '1 cup (177g)', calories: 225, protein: 15, carbs: 40, fat: 0.9, fiber: 11 },
    { name: 'Peanut butter', serving: '2 tbsp (32g)', calories: 190, protein: 7, carbs: 7, fat: 16, fiber: 1.5 },
    { name: 'Almonds', serving: '1/4 cup (35g)', calories: 207, protein: 7.5, carbs: 7, fat: 18, fiber: 4 },
    { name: 'Walnuts', serving: '1/4 cup (30g)', calories: 196, protein: 4.6, carbs: 4, fat: 19.6, fiber: 2 },
    { name: 'Cashews', serving: '1/4 cup (32g)', calories: 180, protein: 5, carbs: 10, fat: 14, fiber: 1 },
    { name: 'Mixed nuts', serving: '1/4 cup (35g)', calories: 203, protein: 5.6, carbs: 8.5, fat: 18, fiber: 2.4 },
    { name: 'Hummus', serving: '1/4 cup (62g)', calories: 104, protein: 5, carbs: 9, fat: 6, fiber: 2 },
    { name: 'Edamame', serving: '1 cup (155g)', calories: 188, protein: 18.5, carbs: 14, fat: 8, fiber: 8 },
    { name: 'Dal (cooked lentil soup)', serving: '1 cup (240ml)', calories: 180, protein: 12, carbs: 28, fat: 2.5, fiber: 8 },

    // Common meals & snacks
    { name: 'Protein shake (whey)', serving: '1 scoop + water', calories: 120, protein: 24, carbs: 3, fat: 1.5, fiber: 0 },
    { name: 'Protein bar', serving: '1 bar (60g)', calories: 220, protein: 20, carbs: 22, fat: 8, fiber: 3 },
    { name: 'Granola bar', serving: '1 bar (40g)', calories: 190, protein: 3, carbs: 29, fat: 7, fiber: 2 },
    { name: 'Trail mix', serving: '1/4 cup (40g)', calories: 180, protein: 5, carbs: 16, fat: 12, fiber: 2 },
    { name: 'Pizza slice (cheese)', serving: '1 slice', calories: 272, protein: 12, carbs: 34, fat: 10, fiber: 2 },
    { name: 'Pizza slice (pepperoni)', serving: '1 slice', calories: 311, protein: 13, carbs: 34, fat: 14, fiber: 2 },
    { name: 'Cheeseburger', serving: '1 burger', calories: 535, protein: 28, carbs: 40, fat: 29, fiber: 1.5 },
    { name: 'Burrito (chicken)', serving: '1 burrito', calories: 580, protein: 32, carbs: 62, fat: 20, fiber: 6 },
    { name: 'Sandwich (turkey & cheese)', serving: '1 sandwich', calories: 360, protein: 22, carbs: 34, fat: 14, fiber: 2 },
    { name: 'Fried rice', serving: '1 cup (250g)', calories: 340, protein: 10, carbs: 48, fat: 12, fiber: 2 },
    { name: 'Pasta with marinara sauce', serving: '1.5 cups', calories: 350, protein: 12, carbs: 58, fat: 6, fiber: 4 },
    { name: 'Chicken Caesar salad', serving: '1 bowl', calories: 392, protein: 30, carbs: 16, fat: 22, fiber: 3 },
    { name: 'Sushi roll (salmon)', serving: '6 pieces', calories: 304, protein: 12, carbs: 42, fat: 9, fiber: 1 },
    { name: 'Tacos (beef)', serving: '2 tacos', calories: 430, protein: 22, carbs: 36, fat: 20, fiber: 4 },
    { name: 'Biryani (chicken)', serving: '1 plate (300g)', calories: 490, protein: 28, carbs: 55, fat: 16, fiber: 2 },
    { name: 'Butter chicken with rice', serving: '1 plate', calories: 620, protein: 32, carbs: 58, fat: 26, fiber: 3 },
    { name: 'Roti / Chapati', serving: '1 piece', calories: 104, protein: 3.5, carbs: 18, fat: 2.5, fiber: 2.5 },
    { name: 'Dosa (plain)', serving: '1 dosa', calories: 133, protein: 3.6, carbs: 22, fat: 3.5, fiber: 0.8 },
    { name: 'Idli', serving: '2 pieces', calories: 130, protein: 4, carbs: 26, fat: 0.4, fiber: 1.2 },
    { name: 'Samosa (vegetable)', serving: '1 piece', calories: 252, protein: 4, carbs: 28, fat: 14, fiber: 2 },
    { name: 'Pad thai', serving: '1 plate', calories: 460, protein: 18, carbs: 56, fat: 18, fiber: 2 },
    { name: 'Stir fry (chicken & vegetables)', serving: '1 plate', calories: 350, protein: 30, carbs: 20, fat: 16, fiber: 4 },
    { name: 'Soup (chicken noodle)', serving: '1 bowl (240ml)', calories: 120, protein: 8, carbs: 15, fat: 3, fiber: 1 },
    { name: 'Soup (tomato)', serving: '1 bowl (240ml)', calories: 110, protein: 2, carbs: 20, fat: 3, fiber: 2 },

    // Beverages
    { name: 'Coffee (black)', serving: '1 cup (240ml)', calories: 2, protein: 0.3, carbs: 0, fat: 0, fiber: 0 },
    { name: 'Coffee with milk & sugar', serving: '1 cup', calories: 60, protein: 2, carbs: 8, fat: 2, fiber: 0 },
    { name: 'Latte (whole milk)', serving: '12 oz', calories: 180, protein: 10, carbs: 14, fat: 9, fiber: 0 },
    { name: 'Cappuccino', serving: '12 oz', calories: 120, protein: 8, carbs: 10, fat: 6, fiber: 0 },
    { name: 'Orange juice', serving: '1 cup (240ml)', calories: 112, protein: 1.7, carbs: 26, fat: 0.5, fiber: 0.5 },
    { name: 'Smoothie (fruit)', serving: '16 oz', calories: 230, protein: 4, carbs: 52, fat: 1, fiber: 4 },
    { name: 'Coca-Cola', serving: '1 can (355ml)', calories: 140, protein: 0, carbs: 39, fat: 0, fiber: 0 },
    { name: 'Beer', serving: '1 can (355ml)', calories: 153, protein: 1.6, carbs: 13, fat: 0, fiber: 0 },
    { name: 'Wine (red)', serving: '5 oz (150ml)', calories: 125, protein: 0.1, carbs: 4, fat: 0, fiber: 0 },
    { name: 'Chai (with milk & sugar)', serving: '1 cup', calories: 95, protein: 3, carbs: 14, fat: 3, fiber: 0 },

    // Sweets & desserts
    { name: 'Ice cream (vanilla)', serving: '1/2 cup (66g)', calories: 137, protein: 2.3, carbs: 16, fat: 7.3, fiber: 0 },
    { name: 'Chocolate (dark 70%)', serving: '30g', calories: 170, protein: 2, carbs: 13, fat: 12, fiber: 3 },
    { name: 'Chocolate chip cookie', serving: '1 cookie (40g)', calories: 190, protein: 2, carbs: 26, fat: 9, fiber: 1 },
    { name: 'Brownie', serving: '1 piece (50g)', calories: 227, protein: 3, carbs: 28, fat: 12, fiber: 1 },
    { name: 'Donut (glazed)', serving: '1 donut', calories: 269, protein: 4, carbs: 31, fat: 15, fiber: 1 },
    { name: 'Muffin (blueberry)', serving: '1 medium', calories: 340, protein: 5, carbs: 52, fat: 12, fiber: 2 },
    { name: 'Pancakes', serving: '2 medium', calories: 346, protein: 8, carbs: 46, fat: 14, fiber: 1.5 },

    // Oils & dressings
    { name: 'Olive oil', serving: '1 tbsp (14ml)', calories: 119, protein: 0, carbs: 0, fat: 13.5, fiber: 0 },
    { name: 'Coconut oil', serving: '1 tbsp (14ml)', calories: 121, protein: 0, carbs: 0, fat: 13.5, fiber: 0 },
    { name: 'Ranch dressing', serving: '2 tbsp (30ml)', calories: 129, protein: 0.4, carbs: 2, fat: 13, fiber: 0 },
    { name: 'Honey', serving: '1 tbsp (21g)', calories: 64, protein: 0.1, carbs: 17, fat: 0, fiber: 0 },
  ];

  // ── Autocomplete logic ──
  const foodInput = document.getElementById('food-name');
  const dropdown = document.getElementById('autocomplete-dropdown');
  let acIndex = -1;
  let acItems = [];
  let apiTimeout = null;

  function searchLocal(query) {
    const q = query.toLowerCase();
    return FOOD_DB.filter(f => f.name.toLowerCase().includes(q)).slice(0, 8);
  }

  async function searchAPI(query) {
    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=6&fields=product_name,nutriments,serving_size`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.products || [])
        .filter(p => p.product_name && p.nutriments)
        .map(p => {
          const n = p.nutriments;
          return {
            name: p.product_name.slice(0, 60),
            serving: p.serving_size || '100g',
            calories: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
            protein: Math.round((n.proteins_100g || n.proteins || 0) * 10) / 10,
            carbs: Math.round((n.carbohydrates_100g || n.carbohydrates || 0) * 10) / 10,
            fat: Math.round((n.fat_100g || n.fat || 0) * 10) / 10,
            fiber: Math.round((n.fiber_100g || n.fiber || 0) * 10) / 10,
            _api: true,
          };
        });
    } catch { return []; }
  }

  function renderDropdown(myResults, localResults, apiResults, loading) {
    if (!myResults.length && !localResults.length && !apiResults.length && !loading) {
      dropdown.classList.add('hidden');
      return;
    }
    dropdown.classList.remove('hidden');
    let html = '';
    acItems = [];

    function addSection(title, items) {
      if (!items.length) return;
      html += `<div class="ac-section">${title}</div>`;
      items.forEach(f => {
        const idx = acItems.length;
        acItems.push(f);
        html += `<div class="ac-item" data-idx="${idx}"><span class="ac-name">${esc(f.name)}</span><span class="ac-serving">${esc(f.serving)}</span><span class="ac-cal">${f.calories} cal</span></div>`;
      });
    }

    addSection('My Foods', myResults);
    addSection('Common Foods', localResults);
    addSection('OpenFoodFacts', apiResults);

    if (loading) {
      html += '<div class="ac-loading">Searching online...</div>';
    }

    dropdown.innerHTML = html;
    acIndex = -1;

    dropdown.querySelectorAll('.ac-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        selectFood(acItems[parseInt(el.dataset.idx)]);
      });
    });
  }

  // ── Quantity / serving scaling ──
  let baseNutrition = null;

  const qtyInput = document.getElementById('quantity');
  const qtyMinus = document.getElementById('qty-minus');
  const qtyPlus = document.getElementById('qty-plus');

  function applyQuantity() {
    if (!baseNutrition) return;
    const qty = Math.max(0.25, Number(qtyInput.value) || 1);
    document.getElementById('calories').value = Math.round(baseNutrition.calories * qty);
    document.getElementById('protein').value = Math.round(baseNutrition.protein * qty * 10) / 10;
    document.getElementById('carbs').value = Math.round(baseNutrition.carbs * qty * 10) / 10;
    document.getElementById('fat').value = Math.round(baseNutrition.fat * qty * 10) / 10;
    document.getElementById('fiber').value = Math.round(baseNutrition.fiber * qty * 10) / 10;
    const base = baseNutrition.serving;
    if (qty === 1) {
      document.getElementById('serving-size').value = base;
    } else {
      document.getElementById('serving-size').value = qty + 'x ' + base;
    }
  }

  qtyInput.addEventListener('input', applyQuantity);
  qtyMinus.addEventListener('click', () => {
    const cur = Number(qtyInput.value) || 1;
    qtyInput.value = Math.max(0.25, cur - 0.25);
    applyQuantity();
  });
  qtyPlus.addEventListener('click', () => {
    const cur = Number(qtyInput.value) || 1;
    qtyInput.value = cur + 0.25;
    applyQuantity();
  });

  function selectFood(food) {
    foodInput.value = food.name;
    baseNutrition = {
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      fiber: food.fiber,
      serving: food.serving,
    };
    qtyInput.value = 1;
    document.getElementById('calories').value = food.calories;
    document.getElementById('protein').value = food.protein;
    document.getElementById('carbs').value = food.carbs;
    document.getElementById('fat').value = food.fat;
    document.getElementById('fiber').value = food.fiber;
    document.getElementById('serving-size').value = food.serving;
    document.getElementById('serving-base').textContent = '(' + food.serving + ')';
    dropdown.classList.add('hidden');
    document.getElementById('autofill-hint').textContent = 'auto-filled';
  }

  foodInput.addEventListener('input', () => {
    const q = foodInput.value.trim();
    document.getElementById('autofill-hint').textContent = 'type to search foods';
    baseNutrition = null;
    document.getElementById('serving-base').textContent = '';
    qtyInput.value = 1;
    if (q.length < 2) {
      dropdown.classList.add('hidden');
      clearTimeout(apiTimeout);
      return;
    }

    const my = searchMyFoods(q);
    const myNames = new Set(my.map(f => f.name.toLowerCase().trim()));
    const local = searchLocal(q).filter(f => !myNames.has(f.name.toLowerCase().trim()));
    renderDropdown(my, local, [], q.length >= 3);

    clearTimeout(apiTimeout);
    if (q.length >= 3) {
      apiTimeout = setTimeout(async () => {
        const apiResults = await searchAPI(q);
        if (foodInput.value.trim().toLowerCase().startsWith(q.toLowerCase())) {
          const curQ = foodInput.value.trim();
          const myR = searchMyFoods(curQ);
          const myN = new Set(myR.map(f => f.name.toLowerCase().trim()));
          renderDropdown(myR, searchLocal(curQ).filter(f => !myN.has(f.name.toLowerCase().trim())), apiResults, false);
        }
      }, 400);
    }
  });

  foodInput.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('.ac-item');
    if (!items.length || dropdown.classList.contains('hidden')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      acIndex = Math.min(acIndex + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('ac-active', i === acIndex));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      acIndex = Math.max(acIndex - 1, 0);
      items.forEach((el, i) => el.classList.toggle('ac-active', i === acIndex));
    } else if (e.key === 'Enter' && acIndex >= 0) {
      e.preventDefault();
      selectFood(acItems[acIndex]);
    } else if (e.key === 'Escape') {
      dropdown.classList.add('hidden');
    }
  });

  foodInput.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.add('hidden'), 200);
  });

  foodInput.addEventListener('focus', () => {
    if (foodInput.value.trim().length >= 2) {
      foodInput.dispatchEvent(new Event('input'));
    }
  });

  // ── Tab switching ──
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      refresh();
    });
  });

  // ── Form defaults ──
  document.getElementById('entry-date').value = todayStr();
  document.getElementById('entry-time').value = nowTime();

  // ── Form submit ──
  document.getElementById('food-form').addEventListener('submit', e => {
    e.preventDefault();
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: document.getElementById('food-name').value.trim(),
      meal: document.getElementById('meal-type').value,
      calories: Number(document.getElementById('calories').value) || 0,
      protein: Number(document.getElementById('protein').value) || 0,
      carbs: Number(document.getElementById('carbs').value) || 0,
      fat: Number(document.getElementById('fat').value) || 0,
      fiber: Number(document.getElementById('fiber').value) || 0,
      date: document.getElementById('entry-date').value,
      time: document.getElementById('entry-time').value,
      serving: document.getElementById('serving-size').value.trim(),
      notes: document.getElementById('notes').value.trim(),
    };
    entries.push(entry);
    saveEntries();
    addEntryToFirebase(entry);
    // Save to My Foods
    const qtyVal = Number(qtyInput.value) || 1;
    addToMyFoods({
      name: entry.name,
      serving: baseNutrition ? baseNutrition.serving : entry.serving,
      calories: baseNutrition ? baseNutrition.calories : Math.round(entry.calories / qtyVal),
      protein: baseNutrition ? baseNutrition.protein : Math.round(entry.protein / qtyVal * 10) / 10,
      carbs: baseNutrition ? baseNutrition.carbs : Math.round(entry.carbs / qtyVal * 10) / 10,
      fat: baseNutrition ? baseNutrition.fat : Math.round(entry.fat / qtyVal * 10) / 10,
      fiber: baseNutrition ? baseNutrition.fiber : Math.round(entry.fiber / qtyVal * 10) / 10,
    });
    e.target.reset();
    document.getElementById('entry-date').value = todayStr();
    document.getElementById('entry-time').value = nowTime();
    baseNutrition = null;
    qtyInput.value = 1;
    document.getElementById('serving-base').textContent = '';
    document.getElementById('autofill-hint').textContent = 'type to search foods';
    refresh();
  });

  // ── Delete entry ──
  function deleteEntry(id) {
    entries = entries.filter(e => e.id !== id);
    saveEntries();
    deleteEntryFromFirebase(id);
    refresh();
  }

  // ── Render entry HTML ──
  function entryHTML(e) {
    const macros = [
      e.protein ? `P:${e.protein}g` : '',
      e.carbs ? `C:${e.carbs}g` : '',
      e.fat ? `F:${e.fat}g` : '',
      e.fiber ? `Fb:${e.fiber}g` : '',
    ].filter(Boolean).join(' · ');
    return `
      <div class="entry-item">
        <div class="entry-info">
          <div class="entry-name">${esc(e.name)}<span class="meal-badge meal-${e.meal}">${e.meal}</span></div>
          <div class="entry-meta">${e.time || ''}${e.serving ? ' · ' + esc(e.serving) : ''}${e.notes ? ' · ' + esc(e.notes) : ''}</div>
        </div>
        <div style="text-align:right">
          <div class="entry-calories">${e.calories} cal</div>
          <div class="entry-macros">${macros}</div>
        </div>
        <button class="entry-delete" onclick="window._deleteEntry('${e.id}')" title="Delete">&times;</button>
      </div>`;
  }

  window._deleteEntry = deleteEntry;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Render recent entries ──
  function renderRecentEntries() {
    const sorted = [...entries].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (b.time || '').localeCompare(a.time || '');
    });
    const recent = sorted.slice(0, 20);
    const container = document.getElementById('entries-list');
    if (!recent.length) {
      container.innerHTML = '<div class="empty-state">No entries yet. Add your first meal above!</div>';
      return;
    }
    let html = '';
    let lastDate = '';
    for (const e of recent) {
      if (e.date !== lastDate) {
        lastDate = e.date;
        html += `<div style="margin:12px 0 6px;font-size:0.78rem;color:var(--text-dim);font-weight:600">${formatDate(e.date)} (${dayName(e.date)})</div>`;
      }
      html += entryHTML(e);
    }
    container.innerHTML = html;
  }

  // ── Today tab ──
  function renderToday() {
    const today = todayStr();
    const todayEntries = entries.filter(e => e.date === today);
    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    todayEntries.forEach(e => {
      totals.calories += e.calories;
      totals.protein += e.protein;
      totals.carbs += e.carbs;
      totals.fat += e.fat;
      totals.fiber += e.fiber;
    });

    document.getElementById('today-calories').textContent = totals.calories;
    document.getElementById('today-protein').textContent = totals.protein.toFixed(0) + 'g';
    document.getElementById('today-carbs').textContent = totals.carbs.toFixed(0) + 'g';
    document.getElementById('today-fat').textContent = totals.fat.toFixed(0) + 'g';
    document.getElementById('today-fiber').textContent = totals.fiber.toFixed(0) + 'g';

    document.getElementById('cal-target').textContent = targets.calories;
    document.getElementById('protein-target').textContent = targets.protein;
    document.getElementById('carbs-target').textContent = targets.carbs;
    document.getElementById('fat-target').textContent = targets.fat;
    document.getElementById('fiber-target').textContent = targets.fiber;

    setProgress('cal-progress', totals.calories, targets.calories);
    setProgress('protein-progress', totals.protein, targets.protein);
    setProgress('carbs-progress', totals.carbs, targets.carbs);
    setProgress('fat-progress', totals.fat, targets.fat);
    setProgress('fiber-progress', totals.fiber, targets.fiber);

    drawDonut(totals);

    const sorted = [...todayEntries].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const container = document.getElementById('today-entries-list');
    if (!sorted.length) {
      container.innerHTML = '<div class="empty-state">Nothing logged today yet.</div>';
    } else {
      container.innerHTML = sorted.map(entryHTML).join('');
    }
  }

  function setProgress(id, val, max) {
    const pct = max > 0 ? Math.min((val / max) * 100, 100) : 0;
    document.getElementById(id).style.width = pct + '%';
  }

  // ── Donut chart ──
  function drawDonut(totals) {
    const canvas = document.getElementById('macro-donut');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 280 * dpr;
    canvas.height = 280 * dpr;
    ctx.scale(dpr, dpr);

    const cx = 140, cy = 140, outerR = 110, innerR = 70;
    const data = [
      { label: 'Protein', value: totals.protein * 4, color: '#00b894' },
      { label: 'Carbs', value: totals.carbs * 4, color: '#fdcb6e' },
      { label: 'Fat', value: totals.fat * 9, color: '#fd79a8' },
    ];
    const total = data.reduce((s, d) => s + d.value, 0);

    ctx.clearRect(0, 0, 280, 280);

    if (total === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
      ctx.fillStyle = '#242836';
      ctx.fill();
      ctx.fillStyle = '#8b8fa8';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data', cx, cy + 5);
    } else {
      let startAngle = -Math.PI / 2;
      for (const d of data) {
        const sweep = (d.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, startAngle + sweep);
        ctx.arc(cx, cy, innerR, startAngle + sweep, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = d.color;
        ctx.fill();
        startAngle += sweep;
      }
      ctx.fillStyle = '#e4e6f0';
      ctx.font = 'bold 22px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(totals.calories + ' cal', cx, cy + 3);
      ctx.font = '12px -apple-system, sans-serif';
      ctx.fillStyle = '#8b8fa8';
      ctx.fillText('total', cx, cy + 22);
    }

    const legend = document.getElementById('macro-legend');
    legend.innerHTML = data.map(d =>
      `<span class="legend-item"><span class="legend-dot" style="background:${d.color}"></span>${d.label}: ${Math.round(d.value)} cal</span>`
    ).join('');
  }

  // ── Weekly trends chart ──
  let currentMetric = 'calories';

  document.querySelectorAll('.chip[data-metric]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip[data-metric]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMetric = btn.dataset.metric;
      renderTrends();
    });
  });

  function renderTrends() {
    const days = last7Days();
    const dayData = days.map(d => {
      const dayEntries = entries.filter(e => e.date === d);
      return {
        date: d,
        calories: dayEntries.reduce((s, e) => s + e.calories, 0),
        protein: dayEntries.reduce((s, e) => s + e.protein, 0),
        carbs: dayEntries.reduce((s, e) => s + e.carbs, 0),
        fat: dayEntries.reduce((s, e) => s + e.fat, 0),
        fiber: dayEntries.reduce((s, e) => s + e.fiber, 0),
      };
    });

    const metric = currentMetric;
    const values = dayData.map(d => d[metric]);
    const target = targets[metric];
    const maxVal = Math.max(...values, target) * 1.15 || 100;
    const unit = metric === 'calories' ? ' cal' : 'g';

    const canvas = document.getElementById('trends-chart');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = 700, H = 320;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const pad = { top: 20, right: 20, bottom: 40, left: 55 };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;

    ctx.strokeStyle = '#2e3348';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      const label = Math.round(maxVal - (maxVal / 4) * i);
      ctx.fillStyle = '#8b8fa8';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(label + (metric !== 'calories' ? 'g' : ''), pad.left - 8, y + 4);
    }

    const targetY = pad.top + ch * (1 - target / maxVal);
    ctx.strokeStyle = '#6c5ce740';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, targetY);
    ctx.lineTo(W - pad.right, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#a29bfe';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('target: ' + target + unit, W - pad.right - 80, targetY - 6);

    const barWidth = cw / 7 * 0.55;
    const gap = cw / 7;

    const colors = { calories: '#6c5ce7', protein: '#00b894', carbs: '#fdcb6e', fat: '#fd79a8', fiber: '#74b9ff' };
    const color = colors[metric];

    values.forEach((val, i) => {
      const x = pad.left + gap * i + (gap - barWidth) / 2;
      const barH = (val / maxVal) * ch;
      const y = pad.top + ch - barH;

      ctx.fillStyle = color;
      ctx.beginPath();
      roundRect(ctx, x, y, barWidth, barH, 4);
      ctx.fill();

      if (val > 0) {
        ctx.fillStyle = '#e4e6f0';
        ctx.font = 'bold 11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(val), x + barWidth / 2, y - 6);
      }

      ctx.fillStyle = '#8b8fa8';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(dayName(dayData[i].date), x + barWidth / 2, H - pad.bottom + 16);
    });

    const daysWithData = values.filter(v => v > 0);
    const avg = daysWithData.length ? Math.round(daysWithData.reduce((s, v) => s + v, 0) / daysWithData.length) : 0;
    const totalWeek = values.reduce((s, v) => s + v, 0);
    const pctOfTarget = target > 0 && daysWithData.length ? Math.round((avg / target) * 100) : 0;

    const statusClass = pctOfTarget >= 90 && pctOfTarget <= 110 ? 'stat-good' : pctOfTarget >= 75 ? 'stat-warn' : 'stat-bad';

    document.getElementById('weekly-summary').innerHTML = `
      <div class="weekly-stat"><div class="stat-label">Daily Average</div><div class="stat-value">${avg}${unit}</div></div>
      <div class="weekly-stat"><div class="stat-label">Weekly Total</div><div class="stat-value">${Math.round(totalWeek)}${unit}</div></div>
      <div class="weekly-stat"><div class="stat-label">vs Target</div><div class="stat-value ${statusClass}">${pctOfTarget}%</div></div>
      <div class="weekly-stat"><div class="stat-label">Days Logged</div><div class="stat-value">${daysWithData.length}/7</div></div>
    `;
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (h < r * 2) r = h / 2;
    if (w < r * 2) r = w / 2;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, 0);
    ctx.arcTo(x, y + h, x, y, 0);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ── Meal timing chart ──
  function renderTiming() {
    const days = last7Days();
    const weekEntries = entries.filter(e => days.includes(e.date) && e.time);

    const blocks = Array.from({ length: 12 }, (_, i) => ({
      label: `${String(i * 2).padStart(2, '0')}:00`,
      start: i * 2,
      end: i * 2 + 2,
      totalCal: 0,
      count: 0,
    }));

    weekEntries.forEach(e => {
      const h = parseInt(e.time.split(':')[0], 10);
      const idx = Math.floor(h / 2);
      if (blocks[idx]) {
        blocks[idx].totalCal += e.calories;
        blocks[idx].count++;
      }
    });

    const avgCals = blocks.map(b => b.count > 0 ? Math.round(b.totalCal / 7) : 0);
    const maxVal = Math.max(...avgCals) * 1.2 || 100;

    const canvas = document.getElementById('timing-chart');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = 700, H = 320;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const pad = { top: 20, right: 20, bottom: 40, left: 55 };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;

    ctx.strokeStyle = '#2e3348';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = '#8b8fa8';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), pad.left - 8, y + 4);
    }

    const gap = cw / 12;
    const barW = gap * 0.6;

    avgCals.forEach((val, i) => {
      const x = pad.left + gap * i + (gap - barW) / 2;
      const barH = (val / maxVal) * ch;
      const y = pad.top + ch - barH;

      const intensity = val / (maxVal * 0.8);
      const color = intensity > 0.7 ? '#e17055' : intensity > 0.4 ? '#fdcb6e' : '#00b894';

      ctx.fillStyle = val > 0 ? color : '#242836';
      ctx.beginPath();
      roundRect(ctx, x, y, barW, Math.max(barH, 2), 3);
      ctx.fill();

      if (val > 0) {
        ctx.fillStyle = '#e4e6f0';
        ctx.font = 'bold 10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(val, x + barW / 2, y - 5);
      }

      ctx.fillStyle = '#8b8fa8';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(blocks[i].label, x + barW / 2, H - pad.bottom + 16);
    });

    const insightsEl = document.getElementById('timing-insights');
    const peakBlock = blocks[avgCals.indexOf(Math.max(...avgCals))];
    const totalAvg = avgCals.reduce((s, v) => s + v, 0);
    const morningCals = avgCals.slice(3, 6).reduce((s, v) => s + v, 0);
    const afternoonCals = avgCals.slice(6, 9).reduce((s, v) => s + v, 0);
    const eveningCals = avgCals.slice(9, 12).reduce((s, v) => s + v, 0);

    let insights = [];
    if (totalAvg > 0) {
      insights.push(`Peak eating window: <strong>${peakBlock.label}–${String(peakBlock.end).padStart(2, '0')}:00</strong> (avg ${Math.max(...avgCals)} cal/day)`);
      if (morningCals < totalAvg * 0.2 && totalAvg > 0) insights.push('⚠ Low morning intake — consider a larger breakfast for sustained energy.');
      if (eveningCals > totalAvg * 0.5) insights.push('⚠ Over 50% of calories consumed after 6 PM — shifting some earlier may help digestion and sleep.');
      const morningPct = Math.round((morningCals / totalAvg) * 100);
      const afternoonPct = Math.round((afternoonCals / totalAvg) * 100);
      const eveningPct = Math.round((eveningCals / totalAvg) * 100);
      insights.push(`Distribution: Morning ${morningPct}% · Afternoon ${afternoonPct}% · Evening ${eveningPct}%`);
    } else {
      insights.push('No data in the last 7 days.');
    }
    insightsEl.innerHTML = insights.map(i => `<p>${i}</p>`).join('');

    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
    const mealCards = document.getElementById('meal-avg-cards');
    mealCards.innerHTML = mealTypes.map(meal => {
      const mealEntries = weekEntries.filter(e => e.meal === meal);
      const avgCal = mealEntries.length ? Math.round(mealEntries.reduce((s, e) => s + e.calories, 0) / 7) : 0;
      const avgPro = mealEntries.length ? Math.round(mealEntries.reduce((s, e) => s + e.protein, 0) / 7) : 0;
      const count = mealEntries.length;
      return `
        <div class="meal-avg-card">
          <div class="meal-name">${meal}</div>
          <div class="meal-avg-val">${avgCal} cal</div>
          <div class="meal-avg-detail">${avgPro}g protein · ${count} entries</div>
        </div>`;
    }).join('');
  }

  // ── Settings ──
  document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('set-calories').value = targets.calories;
    document.getElementById('set-protein').value = targets.protein;
    document.getElementById('set-carbs').value = targets.carbs;
    document.getElementById('set-fat').value = targets.fat;
    document.getElementById('set-fiber').value = targets.fiber;
    document.getElementById('settings-overlay').classList.remove('hidden');
  });

  document.getElementById('cancel-settings').addEventListener('click', () => {
    document.getElementById('settings-overlay').classList.add('hidden');
  });

  document.getElementById('save-settings').addEventListener('click', () => {
    targets.calories = Number(document.getElementById('set-calories').value) || 2000;
    targets.protein = Number(document.getElementById('set-protein').value) || 150;
    targets.carbs = Number(document.getElementById('set-carbs').value) || 250;
    targets.fat = Number(document.getElementById('set-fat').value) || 65;
    targets.fiber = Number(document.getElementById('set-fiber').value) || 30;
    saveTargetsLocal();
    saveTargetsToFirebase(targets);
    document.getElementById('settings-overlay').classList.add('hidden');
    refresh();
  });

  document.getElementById('settings-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      document.getElementById('settings-overlay').classList.add('hidden');
    }
  });

  // ── Refresh all views ──
  function refresh() {
    renderRecentEntries();
    renderToday();
    renderTrends();
    renderTiming();
  }

  // ── Initialize ──
  initFirebase();
  refresh();
})();
