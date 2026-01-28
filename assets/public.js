function ensureCartUI() {
  // overlay do carrinho
  let overlay = document.getElementById("cartOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "cartOverlay";
    document.body.appendChild(overlay);
  }

  // botão carrinho (topo esquerdo)
  let btn = document.getElementById("cartBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "cartBtn";
    btn.className = "btn secondary";
    btn.type = "button";
    btn.textContent = "Carrinho (0)";
    document.body.appendChild(btn);
  }

  // painel carrinho (topo esquerdo)
  let panel = document.getElementById("cartPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "cartPanel";
    panel.innerHTML = `
      <div class="cartHeader">
        <div class="cartTitle">Carrinho</div>
        <button type="button" class="btn secondary" data-cart-close>Fechar</button>
      </div>

      <div id="cartItems"></div>

      <div class="cartFooter">
        <div class="totalRow">
          <span>Total</span>
          <span id="cartTotal">R$ 0,00</span>
        </div>

        <div class="actionsRow">
          <button type="button" class="btn secondary" data-cart-clear>Limpar</button>
          <button type="button" class="btn" data-cart-checkout>Encomendar</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
  }

  // modal checkout (central)
  let modal = document.getElementById("checkoutModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "checkoutModal";
    modal.innerHTML = `
      <div class="backdrop" data-checkout-close></div>
      <div class="box">
        <div class="boxHeader">
          <h3>Finalizar pedido</h3>
          <button type="button" class="btn secondary closeBtn" data-checkout-close>Fechar</button>
        </div>
        <p class="hint">Informe seus dados para enviarmos o pedido.</p>

        <label>Nick no jogo</label>
        <input id="checkoutNick" class="input" placeholder="" autocomplete="off" />

        <div style="height:10px"></div>

        <label>@ do Discord</label>
        <input id="checkoutDiscord" class="input" placeholder="" autocomplete="off" />

        <div style="height:12px"></div>

        <button type="button" class="btn" id="sendOrderBtn">Enviar pedido</button>

        <p id="checkoutMsg" class="small" style="margin:10px 0 0;"></p>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // abrir/fechar carrinho
  function openCart() {
    panel.classList.add("open");
    overlay.classList.add("open");
  }
  function closeCart() {
    panel.classList.remove("open");
    overlay.classList.remove("open");
  }

  btn.addEventListener("click", openCart);
  overlay.addEventListener("click", closeCart);
  panel.querySelector("[data-cart-close]").addEventListener("click", closeCart);

  // fechar checkout
  modal.querySelectorAll("[data-checkout-close]").forEach((x) =>
    x.addEventListener("click", () => modal.classList.remove("open"))
  );

  return { btn, panel, overlay, modal };
}
