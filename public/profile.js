// public/profile.js
window.Profile = (function () {
  let avatarUrl = null;
  let coverUrl = null;

  function setPreview(imageId, removeId, url) {
    const image = document.getElementById(imageId);
    const remove = document.getElementById(removeId);
    image.src = url || '';
    image.hidden = !url;
    remove.hidden = !url;
  }

  function render(me) {
    const initial = (me.name || '?').slice(0, 1).toUpperCase();
    const avatarButton = document.getElementById('avatarBtn');
    const avatar = document.getElementById('pfAvatar');
    avatarButton.textContent = initial;
    avatar.textContent = initial;
    avatar.style.background = Feed.avatarColor(me.name);
    if (me.avatarUrl) {
      avatarButton.replaceChildren(Object.assign(document.createElement('img'), { src: me.avatarUrl, alt: '' }));
      avatar.replaceChildren(Object.assign(document.createElement('img'), { src: me.avatarUrl, alt: '' }));
    }
    document.getElementById('pfCover').style.backgroundImage = me.coverUrl ? `url("${me.coverUrl}")` : '';
    document.getElementById('pfName').textContent = me.name;
    document.getElementById('pfEmail').textContent = me.email;
    document.getElementById('pfBio').textContent = me.bio || 'No bio yet — tap Edit profile to add one.';
    document.getElementById('pfDomains').innerHTML = (me.domains || []).map(d =>
      `<span class="tag ${d}">${Feed.domainLabel(d)}</span>`).join('') || '<span style="color:var(--muted);font-size:13px">Not following any domains yet</span>';
  }

  async function compressImage(file, maxDimension) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    for (let quality = 0.86; quality >= 0.5; quality -= 0.12) {
      const result = canvas.toDataURL('image/jpeg', quality);
      if (result.length <= 2_500_000) return result;
    }
    throw new Error('Image is too large. Choose a smaller picture.');
  }

  async function open() {
    const overlay = document.getElementById('profileOverlay');
    overlay.classList.add('open');
    try {
      const me = await Trend.api('/api/me');
      avatarUrl = me.avatarUrl || null;
      coverUrl = me.coverUrl || null;
      document.getElementById('pName').value = me.name;
      document.getElementById('pEmail').value = me.email;
      document.getElementById('pBio').value = me.bio || '';
      setPreview('pAvatarPreview', 'pAvatarRemove', avatarUrl);
      setPreview('pCoverPreview', 'pCoverRemove', coverUrl);
      document.querySelectorAll('#pDomains input').forEach((cb) => {
        cb.checked = (me.domains || []).includes(cb.value);
      });
    } catch (e) { showToast(e.message); }
  }

  function close() {
    document.getElementById('profileOverlay').classList.remove('open');
  }

  function init() {
    document.getElementById('pAvatarFile').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        avatarUrl = await compressImage(file, 640);
        setPreview('pAvatarPreview', 'pAvatarRemove', avatarUrl);
      } catch (e) { showToast(e.message); }
      event.target.value = '';
    });
    document.getElementById('pCoverFile').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        coverUrl = await compressImage(file, 1600);
        setPreview('pCoverPreview', 'pCoverRemove', coverUrl);
      } catch (e) { showToast(e.message); }
      event.target.value = '';
    });
    document.getElementById('pAvatarRemove').addEventListener('click', () => {
      avatarUrl = null;
      setPreview('pAvatarPreview', 'pAvatarRemove', null);
    });
    document.getElementById('pCoverRemove').addEventListener('click', () => {
      coverUrl = null;
      setPreview('pCoverPreview', 'pCoverRemove', null);
    });
    document.getElementById('pCancel').addEventListener('click', close);
    document.getElementById('profileOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'profileOverlay') close();
    });
    document.getElementById('pSave').addEventListener('click', async () => {
      const domains = [...document.querySelectorAll('#pDomains input:checked')].map((cb) => cb.value);
      try {
        const updated = await Trend.api('/api/me', 'PUT', {
          bio: document.getElementById('pBio').value,
          domains,
          avatarUrl,
          coverUrl
        });
        const user = Trend.getUser();
        const { avatarUrl: _avatarUrl, coverUrl: _coverUrl, ...sessionUser } = updated;
        Trend.setSession(Trend.getToken(), { ...user, ...sessionUser });
        render(updated);
        showToast('Profile saved.');
        close();
      } catch (e) { showToast(e.message); }
    });
    document.getElementById('pLogout').addEventListener('click', () => {
      Trend.clearSession();
      location.href = 'login.html';
    });
  }

  init();
  return { open, close, render };
})();
