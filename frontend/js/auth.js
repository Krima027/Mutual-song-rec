document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault(); // Prevents the page from refreshing
    
    // You can add validation logic here if needed
    console.log("Logging in...");
});
function redirect() {
    window.location.href = "home.html";
}