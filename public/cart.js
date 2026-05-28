document.addEventListener('DOMContentLoaded', () => {
    const cart = JSON.parse(localStorage.getItem('neon_cart')) || [];
    
    const cartList = document.getElementById('cart-page-items-list');
    const subtotalEl = document.getElementById('page-subtotal');
    const totalEl = document.getElementById('page-total');
    const countTitle = document.getElementById('item-count-title');
    const placeOrderBtn = document.getElementById('place-order-btn');

    const renderCart = () => {
        if (cart.length === 0) {
            cartList.innerHTML = '<div class="empty-cart-msg" style="font-size: 1.2rem; padding: 40px;">Your cart is empty. <a href="customizer.html" style="color: var(--accent-color);">Start designing!</a></div>';
            subtotalEl.textContent = '$0.00';
            totalEl.textContent = '$0.00';
            countTitle.textContent = 'Your cart is currently empty.';
            if (placeOrderBtn) placeOrderBtn.disabled = true;
            return;
        }

        const totalQty = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
        countTitle.textContent = `You have ${totalQty} item${totalQty === 1 ? '' : 's'} in your cart.`;
        cartList.innerHTML = '';
        let subtotal = 0;

        cart.forEach((item, index) => {
            const qty = item.quantity || 1;
            subtotal += item.price * qty;
            const itemEl = document.createElement('div');
            itemEl.className = 'cart-page-item';
            itemEl.innerHTML = `
                <div class="cart-page-item-img">
                    ${item.svgMarkup}
                </div>
                <div class="cart-page-item-info">
                    <div class="cart-page-item-name">${item.text.replace(/\n/g, ' ')}</div>
                    <div class="cart-page-item-details">
                        <strong>Font:</strong> ${item.fontName}<br>
                        <strong>Color:</strong> ${item.colorName}<br>
                        <strong>Size:</strong> ${item.widthIn || Math.round(item.widthCm / 2.54)}in x ${item.heightIn || Math.round(item.heightCm / 2.54)}in / ${item.widthCm}cm x ${item.heightCm}cm<br>
                        <strong>Backing:</strong> ${item.backing === 'cut-to-letter' ? 'Cut to Letter' : item.backing === 'rectangle' ? 'Rectangle' : 'Cut to Shape'}<br>
                        <strong>Material:</strong> ${item.backingColor === 'black' ? 'Black Acrylic' : item.backingColor === 'white' ? 'White Acrylic' : 'Clear Glass'}<br>
                        <strong>Use:</strong> ${item.environment === 'outdoor' ? 'Outdoor (Waterproof)' : 'Indoor'}
                    </div>
                    <div class="cart-page-item-price" style="display: flex; align-items: baseline; gap: 8px; margin-top: 8px;">
                        <span style="font-size: 1.25rem; font-weight: 700; color: #10b981;">$${(item.price * qty).toFixed(2)}</span>
                        ${qty > 1 ? `<span style="font-size: 0.8rem; color: #64748b; font-weight: normal;">($${item.price.toFixed(2)} each)</span>` : ''}
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 14px;">
                        <span style="font-size: 0.85rem; color: #475569; font-weight: 500;">Quantity:</span>
                        <div class="qty-control" style="display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.1); border-radius: 6px; padding: 2px 6px; width: fit-content;">
                            <button class="qty-btn dec-qty-btn" data-index="${index}" style="background: transparent; border: none; color: #1e1b4b; cursor: pointer; width: 22px; height: 22px; font-weight: bold; display: flex; align-items: center; justify-content: center; font-size: 1rem; padding: 0;">-</button>
                            <span class="qty-val" style="font-size: 0.9rem; font-weight: 600; min-width: 20px; text-align: center; color: #1e1b4b;">${qty}</span>
                            <button class="qty-btn inc-qty-btn" data-index="${index}" style="background: transparent; border: none; color: #1e1b4b; cursor: pointer; width: 22px; height: 22px; font-weight: bold; display: flex; align-items: center; justify-content: center; font-size: 1rem; padding: 0;">+</button>
                        </div>
                    </div>
                </div>
                <button class="remove-item-btn" data-index="${index}">
                    Remove
                </button>
            `;
            cartList.appendChild(itemEl);
        });

        subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
        totalEl.textContent = `$${subtotal.toFixed(2)}`;

        // Add remove listeners
        document.querySelectorAll('.remove-item-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                cart.splice(idx, 1);
                localStorage.setItem('neon_cart', JSON.stringify(cart));
                renderCart();
            });
        });

        // Add quantity listeners
        document.querySelectorAll('.dec-qty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                const qty = cart[idx].quantity || 1;
                if (qty > 1) {
                    cart[idx].quantity = qty - 1;
                } else {
                    cart.splice(idx, 1);
                }
                localStorage.setItem('neon_cart', JSON.stringify(cart));
                renderCart();
            });
        });

        document.querySelectorAll('.inc-qty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                const qty = cart[idx].quantity || 1;
                cart[idx].quantity = qty + 1;
                localStorage.setItem('neon_cart', JSON.stringify(cart));
                renderCart();
            });
        });
    };

    // Pre-fill user data if logged in
    const prefillUserData = async () => {
        const supabase = await window.supabaseInitPromise;
        if (supabase) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const nameInput = document.getElementById('cust-name');
                const emailInput = document.getElementById('cust-email');
                if (nameInput && !nameInput.value) {
                    nameInput.value = user.user_metadata?.full_name || '';
                }
                if (emailInput && !emailInput.value) {
                    emailInput.value = user.email || '';
                    emailInput.readOnly = true; // Lock email field to prevent tampering
                    emailInput.style.opacity = '0.7';
                }
            }
        }
    };
    prefillUserData();

    if (placeOrderBtn) {
        placeOrderBtn.addEventListener('click', async () => {
            if (cart.length === 0) return;

            const name = document.getElementById('cust-name').value.trim();
            const email = document.getElementById('cust-email').value.trim();
            const address = document.getElementById('cust-address').value.trim();

            if (!name || !email || !address) {
                alert('Please fill in all customer information fields.');
                return;
            }

            const subtotal = cart.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);

            try {
                placeOrderBtn.disabled = true;
                placeOrderBtn.textContent = '⏳ Redirecting to payment...';

                // Fetch Supabase token if logged in
                const supabase = await window.supabaseInitPromise;
                let token = null;
                if (supabase) {
                    const session = (await supabase.auth.getSession()).data.session;
                    if (session) {
                        token = session.access_token;
                    }
                }

                const headers = { 'Content-Type': 'application/json' };
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                const response = await fetch('/api/create-checkout', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        customer_name: name,
                        customer_email: email,
                        shipping_address: address,
                        items: cart,
                        total_price: subtotal
                    })
                });

                const result = await response.json();

                if (result.url) {
                    // Clear cart and redirect to Stripe hosted checkout
                    localStorage.removeItem('neon_cart');
                    window.location.href = result.url;
                } else {
                    alert('Payment setup failed: ' + (result.error || 'Unknown error'));
                    placeOrderBtn.disabled = false;
                    placeOrderBtn.textContent = 'Complete Purchase';
                }
            } catch (err) {
                console.error('Checkout error:', err);
                alert('Something went wrong. Please try again.');
                placeOrderBtn.disabled = false;
                placeOrderBtn.textContent = 'Complete Purchase';
            }
        });
    }

    renderCart();
});
