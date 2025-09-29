// /public/js/models/Version.js

export class Version {
    /**
     * @param {string} id - The document ID from Firestore.
     * @param {string} versionTag - The version tag, e.g., "v1.2.3".
     * @param {string} notes - The release notes in Markdown format.
     * @param {Date} releaseDate - The date the version was published.
     * @param {string} publishedBy - The email of the user who published the version.
     */
    constructor(id, versionTag, notes, releaseDate, publishedBy) {
        this.id = id;
        this.versionTag = versionTag;
        this.notes = notes;
        this.releaseDate = releaseDate;
        this.publishedBy = publishedBy;
    }

    /**
     * Creates a Version instance from a Firestore document data object.
     * @param {string} id - The document ID.
     * @param {object} data - The data from Firestore.
     * @returns {Version} A new Version instance.
     */
    static fromFirestore(id, data) {
        return new Version(
            id,
            data.versionTag,
            data.notes,
            data.releaseDate.toDate(), // Convert Firestore Timestamp to Date
            data.publishedBy
        );
    }

    /**
     * Converts a Version instance to a plain object for Firestore.
     * The 'id' is typically not stored as a field in the document itself.
     * @returns {object} A plain object representation.
     */
    toFirestore() {
        return {
            versionTag: this.versionTag,
            notes: this.notes,
            releaseDate: this.releaseDate, // Firestore handles Date objects
            publishedBy: this.publishedBy,
        };
    }
}