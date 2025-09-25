import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { db } from "../../../firebase.js";

const setupUsersController = async () => {
  const usersTable = document.querySelector("#users-table tbody");

  if (usersTable) {
    const querySnapshot = await getDocs(collection(db, "users"));
    let html = "";
    querySnapshot.forEach((doc) => {
      const user = doc.data();
      html += `
        <tr>
          <td>${user.email}</td>
          <td>${user.name || ""}</td>
          <td>${user.role || ""}</td>
          <td>
            <button class="btn btn-sm btn-primary">Edit</button>
            <button class="btn btn-sm btn-danger">Delete</button>
          </td>
        </tr>
      `;
    });
    usersTable.innerHTML = html;
  }
};

export { setupUsersController };