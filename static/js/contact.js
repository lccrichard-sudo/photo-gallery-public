const FORMSPREE_ENDPOINT = "https://formspree.io/f/xlgkwkpp";

const contactBtn = document.getElementById("contact-btn");
const contactModal = document.getElementById("contact-modal");
const contactClose = document.getElementById("contact-close");
const contactForm = document.getElementById("contact-form");
const contactStatus = document.getElementById("contact-status");

contactBtn.addEventListener("click", () => {
  contactStatus.textContent = "";
  contactModal.classList.add("active");
});

contactClose.addEventListener("click", () => {
  contactModal.classList.remove("active");
});

contactModal.addEventListener("click", (e) => {
  if (e.target === contactModal) contactModal.classList.remove("active");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && contactModal.classList.contains("active")) {
    contactModal.classList.remove("active");
  }
});

contactForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  contactStatus.textContent = "傳送中…";

  try {
    const res = await fetch(FORMSPREE_ENDPOINT, {
      method: "POST",
      body: new FormData(contactForm),
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      contactStatus.textContent = "已送出，謝謝！";
      contactForm.reset();
    } else {
      contactStatus.textContent = "傳送失敗，請稍後再試。";
    }
  } catch (err) {
    contactStatus.textContent = "傳送失敗，請檢查網路連線。";
  }
});
