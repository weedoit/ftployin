document.querySelector('body').addEventListener('click', function (e) {
    const target = e.target;

    if (target.matches('.tab-label')) {
        const root = target.parentNode.parentNode;
        const current = root.querySelector('.tab-label.active');
        const currentContent = root.querySelector(`.contents [tab-name="${current.getAttribute('tab')}"]`);
        const targetContent = root.querySelector(`.contents [tab-name="${target.getAttribute('tab')}"]`);
        
        current.classList.remove('active');
        currentContent.classList.remove('active');
        target.classList.add('active');
        targetContent.classList.add('active');

        e.preventDefault();
    }
});