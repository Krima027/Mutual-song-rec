document.addEventListener('DOMContentLoaded', () => {

    const loginBtn = document.getElementById("loginBtn");

    loginBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;

        if (!email || !password) {
            alert("Please fill in all fields.");
            return;
        }

        const response = await fetch("/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: email,
                password: password
            })
        });

        const data = await response.json();

        if (response.ok) {
            window.location.href = "/home";
        } else {
            alert(data.message);
        }
    });

});
