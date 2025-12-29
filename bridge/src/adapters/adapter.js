class OpenNotebookAdapter {
  /**
   * @param {string} project
   * @returns {Promise<string>} notebook_id
   */
  async createOrGetNotebook(project) {
    throw new Error("Not implemented: createOrGetNotebook");
  }

  /**
   * @param {string} notebookId
   * @param {string} session
   * @param {string} content
   * @returns {Promise<string>} source_id
   */
  async upsertSource(notebookId, session, content) {
    throw new Error("Not implemented: upsertSource");
  }

  /**
   * @param {string} notebookId
   * @param {string} kind
   * @param {string} content
   * @param {string[]} links
   * @returns {Promise<string>} note_id
   */
  async upsertNote(notebookId, kind, content, links) {
    throw new Error("Not implemented: upsertNote");
  }
}

module.exports = { OpenNotebookAdapter };
