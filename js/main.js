/**
 * Animates the statistics bar values by incrementing them from 0 to their target values.
 * Updates node count, events, cells, and freshness metrics with smooth animations.
 * @returns {void}
 */
function animateStats() {
    const stats = {
        nodes: { current: 0, target: 30000, suffix: '', id: 'stat-nodes' },
        events: { current: 0, target: 12, suffix: 'M', id: 'stat-events' },
        cells: { current: 0, target: 1.8, suffix: 'B', id: 'stat-cells' },
        freshness: { current: 0, target: 1, suffix: 's', id: 'stat-freshness' }
    };

    /**
     * Formats a number with the appropriate suffix (B for billions, M for millions).
     * @param {number} num - The number to format
     * @param {string} suffix - The suffix to append (B, M, or empty)
     * @returns {string} The formatted number with suffix
     */
    function formatNumber(num, suffix) {
        if (suffix === 'B') {
            return num.toFixed(1) + suffix;
        }
        if (suffix === 'M') {
            return num.toLocaleString() + suffix;
        }
        return num.toLocaleString() + suffix;
    }

    /**
     * Updates a single stat element with animated incrementing values.
     * @param {Object} stat - The stat object containing id, current, target, and suffix
     * @returns {void}
     */
    function updateStat(stat) {
        const element = document.getElementById(stat.id);
        if (!element) return;

        const increment = (stat.target - stat.current) / 50;
        stat.current += increment;

        if (stat.current < stat.target) {
            element.textContent = formatNumber(Math.floor(stat.current), stat.suffix);
            requestAnimationFrame(() => updateStat(stat));
        } else {
            element.textContent = formatNumber(stat.target, stat.suffix);
        }
    }

    // Start animations with slight delay
    setTimeout(() => {
        Object.values(stats).forEach(stat => updateStat(stat));
    }, 500);
}

/**
 * Main initialization function that runs when the DOM is ready.
 * Sets up stat animations, smooth scrolling, scroll animations, and live data simulation.
 * @returns {void}
 */
document.addEventListener('DOMContentLoaded', function() {
    // Animate stats on load
    animateStats();

    // Smooth scroll for anchor links
    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);

            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Intersection Observer for scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe sections for animation
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        observer.observe(section);
    });

    /**
     * Simulates live data updates by fluctuating node and event counts periodically.
     * Updates the stats display every 5 seconds with small random increments.
     * @returns {void}
     */
    function simulateLiveData() {
        const nodesElement = document.getElementById('stat-nodes');
        const eventsElement = document.getElementById('stat-events');

        if (nodesElement && eventsElement) {
            // Add small random fluctuations to simulate live data
            setInterval(() => {
                const currentNodes = parseInt(nodesElement.textContent.replace(/,/g, ''));
                const newNodes = currentNodes + Math.floor(Math.random() * 3);
                nodesElement.textContent = newNodes.toLocaleString() + '+';

                const currentEvents = parseInt(eventsElement.textContent.replace(/M/g, ''));
                const newEvents = currentEvents + Math.random() * 0.1;
                eventsElement.textContent = newEvents.toFixed(1) + 'M';
            }, 5000);
        }
    }

    simulateLiveData();
});

// Utility function to check if element is in viewport
function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}
