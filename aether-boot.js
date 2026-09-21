(() => {
  const ticketKey = 'aether-boot-ticket';

  const register = () => {
    if (!window.zeroSiteDesktop?.registerBootSystem) {
      window.setTimeout(register, 0);
      return;
    }

    window.zeroSiteDesktop.registerBootSystem({
      codename: 'aetheros',
      label: 'AetherOS 1.0',
      boot() {
        if (window.matchMedia('(max-width: 640px)').matches) return;

        const launch = () => {
          const ticket = {
            id: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            expiresAt: Date.now() + 120000
          };
          sessionStorage.setItem(ticketKey, JSON.stringify(ticket));
          location.assign(new URL('/os/aether/', location.origin).href);
        };

        if (window.zeroSiteLoader?.playTransition) {
          window.zeroSiteLoader.playTransition('AetherOSを起動しています', launch);
        } else {
          launch();
        }
      }
    });
  };

  register();
})();
